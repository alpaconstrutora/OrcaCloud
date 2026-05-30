import React from 'react';
import { Package, Truck, Printer, Pencil, ArrowLeft, Building2, CreditCard, ChevronRight, FileText, Download, CheckCircle2, X, ExternalLink, Gavel, Clock, Upload, Plus, Loader2, MessageCircle, Zap, Trash2, Copy, AlertCircle, AlertTriangle } from 'lucide-react';
import { PurchaseOrder, Invoice, PurchaseOrderItem } from '../types';
import { orderService } from '../services/orderService';
import { receiptService, PurchaseReceipt } from '../services/receiptService';
import { whatsappService } from '../services/whatsappService';
import { discrepancyService, PurchaseDiscrepancy, DiscrepancyStatus } from '../services/discrepancyService';
import { notificationLogService, NotificationLogEntry } from '../services/notificationLogService';
import { supplierService } from '../services/supplierService';
import { projectService } from '../services/projectService';
import { invoiceService } from '../services/invoiceService';
import OrderLifeline, { OrderStatus } from './OrderLifeline';
import OrderChat from './OrderChat';
import OrderReceiptModal from './OrderReceiptModal';
import { storageService } from '../services/storageService';
import { profileService } from '../services/profileService';
import NegotiationHub from './NegotiationHub';
import { webhookService } from '../services/webhookService';

interface SupplyChainOrderDetailsProps {
    orderId: string;
    onBack: () => void;
    onEdit?: (orderId: string) => void;
    initialView?: 'details' | 'logistics';
    currentUser?: { email: string; name: string };
}

const getStatusStyles = (status: string) => {
    switch (status) {
        case 'Rascunho': return 'bg-gray-100 text-gray-600 border-gray-200';
        case 'Enviado': return 'bg-blue-50 text-blue-600 border-blue-100';
        case 'Confirmado': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
        case 'Separação': return 'bg-amber-50 text-amber-600 border-amber-100';
        case 'Em Trânsito': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
        case 'Entregue':
        case 'Recebido': return 'bg-green-50 text-green-600 border-green-100';
        case 'Divergência': return 'bg-red-50 text-red-600 border-red-100';
        case 'Cancelado': return 'bg-gray-50 text-gray-400 border-gray-100';
        default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
};

const SupplyChainOrderDetails: React.FC<SupplyChainOrderDetailsProps> = ({ orderId, onBack, onEdit, initialView = 'details', currentUser: propUser }) => {
    const [showReceiptModal, setShowReceiptModal] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'details' | 'logistics'>(initialView);
    const [order, setOrder] = React.useState<PurchaseOrder | null>(null);
    const [invoices, setInvoices] = React.useState<Invoice[]>([]);
    const [supplierName, setSupplierName] = React.useState('');
    const [supplierEmail, setSupplierEmail] = React.useState('');
    const [projectName, setProjectName] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [showNegotiation, setShowNegotiation] = React.useState(false);
    const [currentUser, setCurrentUser] = React.useState<{ email: string; name: string } | null>(propUser || null);
    const [isUploadingInvoice, setIsUploadingInvoice] = React.useState(false);
    const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
    const [editQty, setEditQty] = React.useState<number>(0);
    const [editPrice, setEditPrice] = React.useState<number>(0);
    const [editDescription, setEditDescription] = React.useState<string>('');
    const [editUnit, setEditUnit] = React.useState<string>('');
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [receipts, setReceipts] = React.useState<PurchaseReceipt[]>([]);
    const [discrepancies, setDiscrepancies] = React.useState<PurchaseDiscrepancy[]>([]);
    const [notifLogs, setNotifLogs] = React.useState<NotificationLogEntry[]>([]);
    const [resolutionInputs, setResolutionInputs] = React.useState<Record<string, string>>({});
    const [resolvingId, setResolvingId] = React.useState<string | null>(null);
    const [isSendingWhatsApp, setIsSendingWhatsApp] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);

    const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const askConfirm = (message: string, onConfirm: () => void) => {
        setPendingConfirm({ message, onConfirm });
    };

    const handleUpdateStatus = async (newStatus: PurchaseOrder['status']) => {
        try {
            setLoading(true);
            await orderService.updateOrder(orderId, { status: newStatus }, order?.version);
            await loadOrderData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Error updating order status:", error);
            if (error.message?.startsWith('CONFLICT')) {
                notify("Pedido foi modificado por outro usuário. Recarregue a página.", "error");
            } else {
                notify("Erro ao atualizar o status do pedido.", "error");
            }
            await loadOrderData();
        } finally {
            setLoading(false);
        }
    };

    const handleStartEdit = (idx: number, item: PurchaseOrderItem) => {
        setEditingIndex(idx);
        setEditQty(item.quantity);
        setEditPrice(item.unitPrice);
        setEditDescription(item.description || '');
        setEditUnit(item.unit || '');
    };

    const handleSaveItemEdit = async (idx: number) => {
        if (!order) return;
        try {
            setLoading(true);
            const freshOrder = await orderService.getOrderById(orderId);
            if (!freshOrder) { notify("Erro ao carregar pedido.", "error"); return; }
            const newItems = [...freshOrder.items];
            newItems[idx] = {
                ...newItems[idx],
                description: editDescription,
                unit: editUnit,
                quantity: editQty,
                unitPrice: editPrice,
                total: editQty * editPrice
            };
            await orderService.updateOrder(orderId, { items: newItems }, freshOrder.version);
            setEditingIndex(null);
            await loadOrderData();
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error("Error saving item edit:", error);
            notify("Erro ao salvar alteração do item.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteItem = async (idx: number) => {
        if (!order) return;
        askConfirm("Deseja realmente excluir este item do pedido?", async () => {
            try {
                setLoading(true);
                const freshOrder = await orderService.getOrderById(orderId);
                if (!freshOrder) { notify("Erro ao carregar pedido.", "error"); return; }
                const newItems = freshOrder.items.filter((_, i) => i !== idx);
                await orderService.updateOrder(orderId, { items: newItems }, freshOrder.version);
                await loadOrderData();
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.error("Error deleting item:", error);
                notify("Erro ao excluir item do pedido.", "error");
            } finally {
                setLoading(false);
            }
        });
    };

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const allOrders = await orderService.listOrders();
                if (cancelled) return;
                const foundOrder = allOrders.find(o => o.id === orderId);

                if (foundOrder) {
                    setOrder(foundOrder);

                    if (foundOrder.supplierId) {
                        const supplier = await supplierService.getById(foundOrder.supplierId);
                        if (cancelled) return;
                        setSupplierName(supplier?.name || 'Fornecedor Desconhecido');
                        setSupplierEmail(supplier?.email || '');
                    }

                    if (foundOrder.projectId) {
                        const project = await projectService.loadProject(foundOrder.projectId);
                        if (cancelled) return;
                        setProjectName(project?.name || 'Obra Desconhecida');
                    }

                    const linkedInvoices = await invoiceService.listInvoicesByOrder(orderId);
                    if (cancelled) return;
                    setInvoices(linkedInvoices);

                    const orderReceipts = await receiptService.listByOrder(orderId);
                    if (cancelled) return;
                    setReceipts(orderReceipts);

                    const orderDiscrepancies = await discrepancyService.listByOrder(orderId);
                    if (cancelled) return;
                    setDiscrepancies(orderDiscrepancies);

                    const orderNotifLogs = await notificationLogService.listByOrder(orderId);
                    if (cancelled) return;
                    setNotifLogs(orderNotifLogs);
                }

                if (!propUser) {
                    const user = await profileService.getCurrentUser();
                    if (cancelled) return;
                    if (user) setCurrentUser(user);
                }
            } catch (error) {
                console.error("Error loading order details:", error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [orderId]);

    const loadOrderData = async (): Promise<PurchaseOrder | null> => {
        try {
            const [allOrders, linkedInvoices, orderReceipts, orderDiscrepancies, orderNotifLogs] = await Promise.all([
                orderService.listOrders(),
                invoiceService.listInvoicesByOrder(orderId),
                receiptService.listByOrder(orderId),
                discrepancyService.listByOrder(orderId),
                notificationLogService.listByOrder(orderId),
            ]);
            const foundOrder = allOrders.find(o => o.id === orderId) || null;
            if (foundOrder) setOrder(foundOrder);
            setInvoices(linkedInvoices);
            setReceipts(orderReceipts);
            setDiscrepancies(orderDiscrepancies);
            setNotifLogs(orderNotifLogs);
            return foundOrder;
        } catch (error) {
            console.error("Error reloading order:", error);
            return null;
        }
    };

    const handleDeleteOrder = () => {
        if (!order) return;
        askConfirm(`Deseja realmente excluir o pedido ${order.number}? Esta ação não pode ser desfeita.`, () => {
            (async () => {
                try {
                    setLoading(true);
                    await orderService.deleteOrder(order.id);
                    onBack();
                } catch (err: unknown) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    console.error("Error deleting order:", error);
                    notify(`Erro ao excluir o pedido: ${error.message || 'Erro desconhecido'}`, "error");
                } finally {
                    setLoading(false);
                }
            })();
        });
    };

    const handleResolveDiscrepancy = async (id: string, status: DiscrepancyStatus) => {
        try {
            setResolvingId(id);
            const notes = resolutionInputs[id] || undefined;
            const updated = await discrepancyService.updateStatus(id, status, notes);
            setDiscrepancies(prev => prev.map(d => d.id === id ? updated : d));
            setResolutionInputs(prev => { const n = { ...prev }; delete n[id]; return n; });
        } catch (error) {
            console.error("Error resolving discrepancy:", error);
            notify("Erro ao atualizar divergência.", "error");
        } finally {
            setResolvingId(null);
        }
    };

    const handleDuplicateOrder = async () => {
        if (!order) return;
        try {
            setLoading(true);
            await orderService.duplicateOrder(order.id);
            notify("Pedido duplicado com sucesso! O novo pedido está como Rascunho.");
        } catch (error) {
            console.error("Error duplicating order:", error);
            notify("Erro ao duplicar o pedido.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !order) return;

        // Check file type
        const allowedTypes = ['application/pdf', 'text/xml', 'application/xml', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.xml')) {
            notify("Tipo de arquivo não suportado. Use PDF, XML ou Imagens.", "error");
            return;
        }

        try {
            setIsUploadingInvoice(true);
            await invoiceService.uploadInvoice(order.supplierId, file, undefined, order.id);
            await loadOrderData();
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            console.error("Erro ao subir nota:", err);
            notify("Erro ao anexar nota fiscal.", "error");
        } finally {
            setIsUploadingInvoice(false);
        }
    };

    const handleWhatsAppShare = async () => {
        if (!order) return;

        // WhatsApp Cloud API (oficial) — se configurado, envia direto
        if (whatsappService.isConfigured()) {
            try {
                setIsSendingWhatsApp(true);
                const supplier = await supplierService.getById(order.supplierId);
                if (!supplier?.phone) {
                    notify('Fornecedor sem telefone cadastrado. Adicione o telefone na ficha do fornecedor.', 'error');
                    return;
                }
                const total = order.items.reduce((sum, item) => sum + (item.total || 0), 0);
                const message = whatsappService.buildOrderSentMessage({
                    supplierName: supplier.name,
                    orderNumber:  order.number || order.id,
                    projectName,
                    itemCount:    order.items.length,
                    total,
                    deliveryDate: order.deliveryDate,
                });
                await whatsappService.sendText(supplier.phone, message, order.id);
                await loadOrderData();
                notify('WhatsApp enviado com sucesso!');
                return;
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                notify(`Erro ao enviar WhatsApp: ${error.message}`, 'error');
                return;
            } finally {
                setIsSendingWhatsApp(false);
            }
        }

        // Fallback: share nativo via wa.me (somente quando API não configurada)
        let text = `*Pedido de Compra #${order.number}* - OrçaCloud\n`;
        text += `Obra: ${projectName}\n`;
        text += `Status: ${order.status}\n\n`;
        const total = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
            order.items.reduce((sum, item) => sum + (item.total || 0), 0)
        );
        text += `*Valor Total:* ${total}\n\n*Itens do Pedido:*\n`;
        order.items.slice(0, 5).forEach(item => {
            text += `- ${item.quantity}${item.unit} ${item.description}\n`;
        });
        if (order.items.length > 5) text += `... (e mais ${order.items.length - 5} itens)\n`;
        text += `\nAcesse o portal para mais detalhes e confirmação.\n`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleSendWebhook = () => {
        if (!order) return;

        const confirmMessage = order.status === 'Enviado'
            ? "Este pedido já foi enviado. Deseja enviar novamente para o fornecedor via automação?"
            : "Deseja enviar o pedido para o fornecedor via automação? Isso atualizará o status para 'Enviado'.";

        askConfirm(confirmMessage, () => {
            (async () => {
                try {
                    setLoading(true);

                    let supplierData = null;
                    if (order.supplierId) {
                        supplierData = await supplierService.getById(order.supplierId);
                    }

                    let projectData = null;
                    if (order.projectId) {
                        projectData = await projectService.loadProject(order.projectId);
                    }

                    await webhookService.triggerOrderSentWebhook(order, supplierData ?? undefined, projectData ?? undefined);

                    if (order.status === 'Rascunho') {
                        await orderService.updateOrder(order.id, { status: 'Enviado' }, order.version);
                    }

                    await loadOrderData();
                    notify("Pedido enviado via automação com sucesso!");
                } catch (err: unknown) {
                    const error = err instanceof Error ? err : new Error(String(err));
                    console.error("Erro ao enviar pedido via webhook:", error);
                    notify(`Erro na operação: ${error.message || 'Erro desconhecido'}`, "error");
                } finally {
                    setLoading(false);
                }
            })();
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Pedido não encontrado.</p>
                <button onClick={onBack} className="text-blue-600 mt-4 hover:underline">Voltar</button>
            </div>
        );
    }

    const canDeleteOrder = (status: string) =>
        !['Entregue', 'Recebido', 'Divergência'].includes(status);

    const totalValue = order.items.reduce((sum, item) => sum + (item.total || 0), 0);

    if (viewMode === 'logistics') {
        return (
            <>
            <div className="bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between mb-12">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest transition-colors group"
                    >
                        <ArrowLeft className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                        Voltar para Pedidos
                    </button>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setViewMode('details')}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100/50 hover:bg-indigo-100 transition-all"
                        >
                            <FileText className="w-3 h-3" />
                            Ver Detalhes do Pedido
                        </button>
                        <div className="text-right">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Rastreamento Logístico</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Pedido: {order.number}</p>
                        </div>
                    </div>
                </div>

                <div className="py-12">
                    <OrderLifeline
                        status={(() => {
                            switch (order.status) {
                                case 'Confirmado': return 'CONFIRMED';
                                case 'Separação': return 'PREPARING';
                                case 'Em Trânsito': return 'SHIPPED';
                                case 'Entregue': return 'DELIVERED';
                                case 'Recebido': return 'RECEIVED';
                                case 'Divergência': return 'DIVERTED';
                                default: return 'BIDDING';
                            }
                        })()}
                        estimatedDelivery={order.deliveryDate ? new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'A definir'}
                        separationDate={order.separationDate}
                        shippedDate={order.shippedDate}
                        deliveredDate={order.actualDeliveryDate}
                    />
                </div>

                <div className="mt-12 p-8 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div>
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Previsão de Entrega</p>
                        <p className="text-sm font-bold text-gray-900">{order.deliveryDate ? new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não informada'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Fornecedor</p>
                        <p className="text-sm font-bold text-gray-900">{supplierName}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Status Atual</p>
                        <p className="text-sm font-bold text-gray-900">{order.status}</p>
                    </div>
                </div>
            </div>
            {notification && (
                <div className={`fixed bottom-8 right-8 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-white text-sm font-bold animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'error' ? 'bg-red-500' : notification.type === 'info' ? 'bg-blue-500' : 'bg-emerald-500'
                }`}>
                    {notification.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                    {notification.message}
                </div>
            )}
            {pendingConfirm && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
                        <p className="text-sm font-bold text-gray-800 text-center mb-6 leading-relaxed">{pendingConfirm.message}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setPendingConfirm(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Cancelar</button>
                            <button onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }} className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
            </>
        );
    }

    return (
        <>
        <div className="space-y-8 animate-in slide-in-from-right-4 duration-500 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <div className="flex items-start gap-5">
                    <button
                        onClick={onBack}
                        className="mt-1 p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-4 flex-wrap">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedido <span className="text-indigo-600">#{order.number}</span></h1>
                            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusStyles(order.status)} animate-in fade-in duration-700`}>
                                {order.status}
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" />
                                {projectName}
                            </p>
                            <span className="w-1 h-1 bg-gray-200 rounded-full" />
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '---'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap md:justify-end">
                    <button
                        onClick={() => setViewMode('logistics')}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100/50 shadow-sm active:scale-95"
                    >
                        <Truck className="w-4 h-4" />
                        Rastreio
                    </button>

                    {onEdit && (
                        <button
                            onClick={() => onEdit(orderId)}
                            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                        >
                            <Pencil className="w-4 h-4 text-indigo-500" />
                            Editar
                        </button>
                    )}

                    {order.status === 'Entregue' && currentUser?.email !== supplierEmail && (
                        <button
                            onClick={() => setShowReceiptModal(true)}
                            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 active:scale-95"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Receber
                        </button>
                    )}

                    <button
                        onClick={() => setShowNegotiation(true)}
                        className="flex items-center gap-2 bg-amber-50 text-amber-600 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-amber-100 transition-all border border-amber-100 active:scale-95"
                    >
                        <Gavel className="w-4 h-4" />
                        Negociar
                    </button>

                    <button
                        onClick={handleSendWebhook}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 text-xs font-black uppercase tracking-widest disabled:opacity-50 active:scale-95"
                        title="Enviar para Automação (Make.com)"
                    >
                        <Zap className="w-4 h-4" />
                        Enviar Automação
                    </button>

                    <button
                        onClick={() => window.print()}
                        className="p-3 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-all shadow-sm active:scale-95"
                        title="Imprimir Pedido"
                    >
                        <Printer className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleDuplicateOrder}
                        className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded-2xl transition-all shadow-sm active:scale-95"
                        title="Duplicar Pedido"
                    >
                        <Copy className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleDeleteOrder}
                        disabled={!canDeleteOrder(order.status)}
                        className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-2xl transition-all shadow-sm active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-gray-50"
                        title={canDeleteOrder(order.status) ? 'Excluir Pedido' : `Pedido "${order.status}" não pode ser excluído`}
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleWhatsAppShare}
                        disabled={isSendingWhatsApp}
                        className="p-3 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 rounded-2xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        title={whatsappService.isConfigured() ? 'Enviar WhatsApp (API Oficial)' : 'Compartilhar via WhatsApp'}
                    >
                        {isSendingWhatsApp
                            ? <Loader2 className="w-5 h-5 animate-spin" />
                            : <MessageCircle className="w-5 h-5 fill-current" />
                        }
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Information Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4 relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Building2 className="w-12 h-12 text-gray-900" />
                            </div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                Fornecedor
                            </h3>
                            <div>
                                <p className="text-base font-black text-gray-900 leading-tight">{supplierName || 'Carregando...'}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{supplierEmail || 'E-mail não informado'}</p>
                            </div>
                        </div>

                        <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4 relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Truck className="w-12 h-12 text-indigo-500" />
                            </div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                                Logística
                            </h3>
                            <div>
                                <p className="text-base font-black text-gray-900 leading-tight">{order.deliveryMethod || 'CIF - Fornecedor'}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mt-1 flex items-center gap-1">
                                    <Package className="w-3 h-3" />
                                    Destino: {order.deliveryLocation || 'Canteiro'}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4 relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                <CreditCard className="w-12 h-12 text-emerald-500" />
                            </div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                Pagamento
                            </h3>
                            <div>
                                <p className="text-base font-black text-gray-900 leading-tight">{order.paymentMethod || 'A combinar'}</p>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${order.paymentTermType === 'Parcelado' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {order.paymentTermType || 'Vista'}
                                    </span>
                                    <p className="text-[10px] font-bold text-gray-400">
                                        {order.paymentTermType === 'Parcelado'
                                            ? `${order.paymentInstallments || 1}x sem juros`
                                            : `Prazo: ${order.paymentDays || 0} dias`}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Logistics Life-line */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-10 flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-xl">
                                <Truck className="w-4 h-4 text-indigo-500" />
                            </div>
                            Fluxo de Atendimento
                        </h3>
                        <div className="px-4">
                            <OrderLifeline
                                status={(() => {
                                    switch (order.status) {
                                        case 'Confirmado': return 'CONFIRMED';
                                        case 'Em Negociação':
                                        case 'Enviado': return 'BIDDING';
                                        case 'Separação': return 'PREPARING';
                                        case 'Em Trânsito': return 'SHIPPED';
                                        case 'Entregue': return 'DELIVERED';
                                        case 'Recebido': return 'RECEIVED';
                                        case 'Divergência': return 'DIVERTED';
                                        default: return 'BIDDING';
                                    }
                                })()}
                                estimatedDelivery={order.deliveryDate ? new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'A definir'}
                                separationDate={order.separationDate}
                                shippedDate={order.shippedDate}
                                deliveredDate={order.actualDeliveryDate}
                            />
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-xl">
                                    <Package className="w-4 h-4 text-blue-500" />
                                </div>
                                Itens do Pedido
                                <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-lg text-[10px]">{order.items.length} itens</span>
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Código</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">Descrição</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-right">Qtd</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-right">Un</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-right">Unitário</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-right">Total</th>
                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {order.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-8 py-5 font-mono text-[11px] text-gray-400">{item.code}</td>
                                            <td className="px-8 py-5 font-bold text-gray-900 max-w-xs">
                                                {editingIndex === idx ? (
                                                    <input
                                                        type="text"
                                                        value={editDescription}
                                                        onChange={(e) => setEditDescription(e.target.value)}
                                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                ) : item.description}
                                            </td>
                                            <td className="px-8 py-5 text-right font-black text-indigo-600">
                                                {editingIndex === idx ? (
                                                    <input
                                                        type="number"
                                                        value={editQty}
                                                        onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                                                        className="w-20 text-right border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                ) : item.quantity}
                                            </td>
                                            <td className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase">
                                                {editingIndex === idx ? (
                                                    <input
                                                        type="text"
                                                        value={editUnit}
                                                        onChange={(e) => setEditUnit(e.target.value)}
                                                        className="w-16 text-center border border-gray-300 rounded px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                ) : item.unit}
                                            </td>
                                            <td className="px-8 py-5 text-right font-bold text-gray-900">
                                                {editingIndex === idx ? (
                                                    <input
                                                        type="number"
                                                        value={editPrice}
                                                        onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                                                        className="w-24 text-right border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                ) : (
                                                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)
                                                )}
                                            </td>
                                            <td className="px-8 py-5 text-right font-black text-gray-900 bg-gray-50/30">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(editingIndex === idx ? (editQty * editPrice) : item.total)}
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {editingIndex === idx ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleSaveItemEdit(idx)}
                                                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                title="Salvar"
                                                            >
                                                                <CheckCircle2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingIndex(null)}
                                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Cancelar"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleStartEdit(idx, item)}
                                                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                                title="Editar"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteItem(idx)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                                title="Excluir"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-900 text-white">
                                    <tr>
                                        <td colSpan={6} className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest opacity-60">Valor Total do Pedido</td>
                                        <td className="px-8 py-6 text-right font-black text-xl">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-8">
                    <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-xl">
                                <FileText className="w-4 h-4 text-indigo-500" />
                            </div>
                            Observações
                        </h3>
                        <div className="relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-100 rounded-full" />
                            <p className="text-sm text-gray-600 pl-4 py-1 italic leading-relaxed">
                                {order.notes || "Nenhuma observação registrada pelo comprador."}
                            </p>
                        </div>
                    </div>

                    {/* Receipts from purchase_receipts table */}
                    {receipts.length > 0 && (
                        <div className="space-y-4">
                            {receipts.map((receipt, rIdx) => (
                                <div key={receipt.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                            {receipt.status === 'Recebido' ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            ) : receipt.status === 'Divergência' ? (
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            ) : (
                                                <Package className="w-4 h-4 text-blue-500" />
                                            )}
                                            {receipt.status === 'Parcial' ? 'Recebimento Parcial' : `Conferência de Entrega`}
                                            {receipts.length > 1 && (
                                                <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">#{receipts.length - rIdx}</span>
                                            )}
                                        </h3>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            {new Date(receipt.receivedAt).toLocaleString('pt-BR')}
                                        </span>
                                    </div>

                                    {receipt.items.length > 0 && (
                                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-black text-gray-400 uppercase tracking-widest">Item</th>
                                                        <th className="px-3 py-2 text-right font-black text-gray-400 uppercase tracking-widest">Pedido</th>
                                                        <th className="px-3 py-2 text-right font-black text-gray-400 uppercase tracking-widest">Recebido</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {receipt.items.map(item => {
                                                        const isShort = item.quantityReceived < item.quantityOrdered;
                                                        return (
                                                            <tr key={item.orderItemCode} className={isShort ? 'bg-amber-50/50' : ''}>
                                                                <td className="px-3 py-2">
                                                                    <p className="font-bold text-gray-900">{item.description}</p>
                                                                    {item.issue && (
                                                                        <p className="text-[10px] text-amber-600 font-bold uppercase mt-0.5">{item.issue}</p>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-right font-bold text-gray-500">
                                                                    {item.quantityOrdered} {item.unit}
                                                                </td>
                                                                <td className={`px-3 py-2 text-right font-black ${isShort ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                    {item.quantityReceived} {item.unit}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {receipt.notes && (
                                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Observações</p>
                                            <p className="text-sm text-gray-700 italic">"{receipt.notes}"</p>
                                        </div>
                                    )}

                                    {receipt.photoPath && (
                                        <a
                                            href={storageService.getPublicUrl('receipts', receipt.photoPath)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block relative group overflow-hidden rounded-xl border-2 border-gray-100 hover:border-indigo-500 transition-all aspect-video bg-gray-50"
                                        >
                                            <img
                                                src={storageService.getPublicUrl('receipts', receipt.photoPath)}
                                                alt="Comprovante"
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <div className="bg-white/90 p-2 rounded-lg flex items-center gap-2 text-xs font-bold text-gray-900">
                                                    <ExternalLink className="w-4 h-4" />
                                                    Ver em tamanho real
                                                </div>
                                            </div>
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Discrepancy Workflow */}
                    {discrepancies.length > 0 && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">
                                    Divergências
                                </h3>
                                <span className="ml-auto px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 text-amber-700">
                                    {discrepancies.filter(d => d.status === 'Pendente').length} pendente(s)
                                </span>
                            </div>

                            <div className="space-y-3">
                                {discrepancies.map(d => {
                                    const statusColors: Record<string, string> = {
                                        Pendente:  'bg-amber-100 text-amber-700 border-amber-200',
                                        Resolvida: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                                        Aceita:    'bg-blue-100 text-blue-700 border-blue-200',
                                        Devolvida: 'bg-gray-100 text-gray-600 border-gray-200',
                                    };
                                    return (
                                        <div key={d.id} className={`p-4 rounded-2xl border space-y-3 ${d.status === 'Pendente' ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-gray-900 leading-snug">{d.description}</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                                        {d.quantity} {d.unit} —{' '}
                                                        <span className="font-bold text-amber-600 uppercase">{d.issue}</span>
                                                    </p>
                                                </div>
                                                <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusColors[d.status]}`}>
                                                    {d.status}
                                                </span>
                                            </div>

                                            {d.resolutionNotes && (
                                                <p className="text-[10px] text-gray-500 italic border-l-2 border-gray-200 pl-2">
                                                    {d.resolutionNotes}
                                                </p>
                                            )}

                                            {d.status === 'Pendente' && (
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Observação da resolução (opcional)"
                                                        value={resolutionInputs[d.id] || ''}
                                                        onChange={e => setResolutionInputs(prev => ({ ...prev, [d.id]: e.target.value }))}
                                                        className="w-full text-xs rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                                                    />
                                                    <div className="flex gap-2">
                                                        {(['Resolvida', 'Aceita', 'Devolvida'] as DiscrepancyStatus[]).map(s => (
                                                            <button
                                                                key={s}
                                                                onClick={() => handleResolveDiscrepancy(d.id, s)}
                                                                disabled={resolvingId === d.id}
                                                                className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
                                                                    s === 'Resolvida' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                                                                    s === 'Aceita'    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' :
                                                                                        'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                                }`}
                                                            >
                                                                {resolvingId === d.id ? '...' : s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="bg-indigo-600 p-8 rounded-[2rem] shadow-xl shadow-indigo-100 flex flex-col gap-6 text-white relative overflow-hidden">
                        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />

                        <div>
                            <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Status Interno</h3>
                            <p className="text-sm font-bold leading-tight">
                                Este pedido encontra-se no estágio de <span className="bg-white/20 px-2 py-0.5 rounded-md text-white">{order.status}</span>.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 pt-6 border-t border-white/10">
                            {order.status === 'Rascunho' && (
                                <button
                                    onClick={() => handleUpdateStatus('Enviado')}
                                    className="w-full py-3.5 bg-white text-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-lg active:scale-95"
                                >
                                    Enviar para Fornecedor
                                </button>
                            )}

                            {order.status === 'Enviado' && (() => {
                                const isSupplier = currentUser && supplierEmail &&
                                    currentUser.email.toLowerCase() === supplierEmail.toLowerCase();

                                return isSupplier ? (
                                    <div className="space-y-3">
                                        <button
                                            onClick={() => handleUpdateStatus('Confirmado')}
                                            className="w-full py-3.5 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 border border-emerald-400"
                                        >
                                            Confirmar Pedido
                                        </button>
                                        <button
                                            onClick={() => setShowNegotiation(true)}
                                            className="w-full py-3.5 bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all border border-white/20 active:scale-95"
                                        >
                                            Negociar Condições
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                                        <p className="text-[10px] text-white/80 font-bold uppercase tracking-widest animate-pulse">
                                            Aguardando aceite do fornecedor...
                                        </p>
                                    </div>
                                );
                            })()}

                            {order.status === 'Em Negociação' && (
                                <button
                                    onClick={() => setShowNegotiation(true)}
                                    className="w-full py-3.5 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg active:scale-95"
                                >
                                    Entrar na Sala de Negociação
                                </button>
                            )}

                            {(order.status === 'Rascunho' || order.status === 'Enviado') && (
                                <button
                                    onClick={() => handleUpdateStatus('Cancelado')}
                                    className="w-full py-3 border border-white/20 text-white/60 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                                >
                                    Cancelar Pedido
                                </button>
                            )}

                            {order.status === 'Confirmado' && (
                                <div className="p-4 bg-white/10 rounded-2xl border border-white/10">
                                    <p className="text-[10px] text-white font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Confirmado
                                    </p>
                                    <p className="text-[10px] text-white/70 leading-relaxed font-bold">
                                        O fornecedor aceitou o pedido. Aguarde a atualização das etapas de logística.
                                    </p>
                                </div>
                            )}

                            {['Entregue', 'Recebido', 'Divergência'].includes(order.status) && (
                                <button
                                    onClick={() => handleUpdateStatus('Cancelado')}
                                    className="w-full py-3 border border-white/20 text-white/60 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all active:scale-95"
                                >
                                    Cancelar Pedido
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Linked NFes (Invoices) */}
                    <div className="relative bg-white p-7 rounded-3xl shadow-sm border border-gray-100">
                        <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3">
                            <div className="p-2 bg-amber-50 rounded-xl">
                                <FileText className="w-4 h-4 text-amber-500" />
                            </div>
                            Documentos Fiscais
                        </h3>

                        <div className="absolute top-7 right-7">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleInvoiceUpload}
                                className="hidden"
                                accept=".pdf,.xml,image/*"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingInvoice}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100/50 hover:bg-amber-100 transition-all disabled:opacity-50"
                            >
                                {isUploadingInvoice ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Upload className="w-3.5 h-3.5" />
                                )}
                                Anexar NFe
                            </button>
                        </div>

                        {invoices.length > 0 ? (
                            <div className="space-y-3">
                                {invoices.map((inv) => (
                                    <div key={inv.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-[1.25rem] border border-gray-100 group hover:border-amber-200 hover:bg-amber-50/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-white text-amber-600 rounded-xl shadow-sm">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-gray-900 truncate max-w-[150px] uppercase tracking-tight">{inv.fileName}</p>
                                                <p className="text-[10px] font-bold text-gray-400 mt-0.5">{new Date(inv.createdAt).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <a
                                            href={invoiceService.getInvoiceUrl(inv.filePath)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-white rounded-xl shadow-sm transition-all"
                                            title="Ver Documento"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 bg-gray-50/30 rounded-3xl border border-dashed border-gray-100">
                                <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Nenhuma NFe vinculada</p>
                            </div>
                        )}
                    </div>

                    {/* Notification Log */}
                    {notifLogs.length > 0 && (
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3">
                                <div className="p-2 bg-blue-50 rounded-xl">
                                    <Zap className="w-4 h-4 text-blue-500" />
                                </div>
                                Histórico de Notificações
                                <span className="ml-auto text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{notifLogs.length}</span>
                            </h3>
                            <div className="space-y-2">
                                {notifLogs.map(log => {
                                    const channelIcon = log.channel === 'email' ? '✉' : log.channel === 'whatsapp' ? '💬' : '⚡';
                                    const channelLabel = log.channel === 'email' ? 'E-mail' : log.channel === 'whatsapp' ? 'WhatsApp' : 'Webhook';
                                    return (
                                        <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/50 border border-gray-100">
                                            <span className="text-base leading-none mt-0.5">{channelIcon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{channelLabel}</span>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                                                        log.status === 'sent'   ? 'bg-emerald-100 text-emerald-700' :
                                                        log.status === 'failed' ? 'bg-red-100 text-red-600' :
                                                                                   'bg-amber-100 text-amber-700'
                                                    }`}>{log.status === 'sent' ? 'Enviado' : log.status === 'failed' ? 'Falhou' : 'Pendente'}</span>
                                                </div>
                                                {log.recipient && (
                                                    <p className="text-[10px] text-gray-500 font-medium truncate mt-0.5">{log.recipient}</p>
                                                )}
                                                {log.subject && (
                                                    <p className="text-[10px] text-gray-700 font-bold truncate">{log.subject}</p>
                                                )}
                                                {log.error && (
                                                    <p className="text-[10px] text-red-500 mt-0.5 truncate" title={log.error}>{log.error}</p>
                                                )}
                                            </div>
                                            <span className="text-[9px] text-gray-400 font-bold shrink-0">
                                                {new Date(log.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Chat Section */}
                    {currentUser && (
                        <div className="mt-6">
                            <OrderChat
                                orderId={orderId}
                                currentUser={currentUser}
                            />
                        </div>
                    )}
                </div>
            </div>
            {/* Receipt Modal */}
            {showReceiptModal && order && (
                <OrderReceiptModal
                    order={order}
                    onClose={() => setShowReceiptModal(false)}
                    onSave={() => loadOrderData()}
                />
            )}
            {/* Negotiation Modal */}
            {showNegotiation && order && currentUser && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                        <NegotiationHub
                            order={order}
                            currentUserEmail={currentUser.email}
                            currentUserRole={
                                currentUser.email.toLowerCase() === supplierEmail.toLowerCase()
                                    ? 'supplier' : 'buyer'
                            }
                            onClose={() => setShowNegotiation(false)}
                            onUpdate={() => loadOrderData()}
                        />
                    </div>
                </div>
            )}
        </div>
        {notification && (
            <div className={`fixed bottom-8 right-8 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-white text-sm font-bold animate-in slide-in-from-bottom-4 duration-300 ${
                notification.type === 'error' ? 'bg-red-500' : notification.type === 'info' ? 'bg-blue-500' : 'bg-emerald-500'
            }`}>
                {notification.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
                {notification.message}
            </div>
        )}
        {pendingConfirm && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
                    <p className="text-sm font-bold text-gray-800 text-center mb-6 leading-relaxed">{pendingConfirm.message}</p>
                    <div className="flex gap-3">
                        <button onClick={() => setPendingConfirm(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Cancelar</button>
                        <button onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }} className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all">Confirmar</button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default SupplyChainOrderDetails;
