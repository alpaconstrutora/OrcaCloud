import React from 'react';
import { Package, Truck, Printer, ArrowLeft, Building2, HandCoins, ChevronRight, FileText, Download, CheckCircle2, X, ExternalLink, Gavel, Clock, Plus, Loader2, MessageCircle, Zap, AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { PurchaseOrder, PurchaseOrderItem } from '../types';
import { orderService } from '../services/orderService';
import { getOrderNumberLockReason, regenerateOrderNumber } from '../services/orderNumberRegenService';
import { receiptService, PurchaseReceipt } from '../services/receiptService';
import { whatsappService } from '../services/whatsappService';
import { discrepancyService, PurchaseDiscrepancy, DiscrepancyStatus } from '../services/discrepancyService';
import { notificationLogService, NotificationLogEntry } from '../services/notificationLogService';
import { supplierService } from '../services/supplierService';
import { projectService } from '../services/projectService';
import { ThreeWayMatchPanel } from './ThreeWayMatchPanel';
import OrderLifeline, { OrderStatus } from './OrderLifeline';
import OrderChat from './OrderChat';
import OrderReceiptModal from './OrderReceiptModal';
import { storageService } from '../services/storageService';
import { profileService } from '../services/profileService';
import NegotiationHub from './NegotiationHub';
import SupplyChainOrderForm from './SupplyChainOrderForm';
import { webhookService } from '../services/webhookService';
import { supplierPortalTokenService } from '../services/supplierPortalTokenService';

interface SupplyChainOrderDetailsProps {
    orderId: string;
    onBack: () => void;
    initialView?: 'details' | 'logistics';
    currentUser?: { email: string; name: string };
    /**
     * Acesso via link público (sem login) — mesmo padrão do Portal do Parceiro.
     * Nesse modo, ações administrativas (excluir/duplicar pedido, editar item,
     * automação, WhatsApp, chat interno, três vias) ficam indisponíveis — só o
     * que é fluxo do próprio fornecedor (ver pedido, confirmar/negociar,
     * anexar NFe) passa pelo token.
     */
    portalToken?: string;
    /**
     * Cor de acento. `indigo` é o padrão do app; `portal` é o coral do
     * vocabulário dos portais externos (§24), usado na visão do fornecedor.
     * Cores SEMÂNTICAS (emerald de sucesso, red de erro, cor do status do
     * pedido) NÃO entram aqui — valem igual nos dois contextos.
     */
    accent?: 'indigo' | 'portal';
}

// Cada variante escrita por extenso — o JIT do Tailwind não enxerga classe
// montada em runtime.
const ACCENTS = {
    indigo: {
        text: 'text-indigo-600',
        icon: 'text-indigo-500',
        softBtn: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-100/50',
        softHoverOnGray: 'hover:text-indigo-600 hover:bg-indigo-50',
        hoverText: 'hover:text-indigo-600',
        panel: 'bg-indigo-50/50 border-indigo-100/50',
        chip: 'bg-indigo-50',
        chipAlt: 'bg-blue-50',
        chipAltIcon: 'text-blue-500',
        chipAltPill: 'bg-blue-100 text-blue-600',
        barSoft: 'bg-indigo-100',
        solid: 'bg-indigo-600 shadow-indigo-100',
        onSolid: 'text-indigo-600',
        ring: 'focus:ring-indigo-500',
        borderHover: 'hover:border-indigo-500',
        spinner: 'border-blue-600',
        negotiateBtn: 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100',
        onSolidSecondary: 'bg-amber-500 text-white hover:bg-amber-600 border border-amber-400',
    },
    portal: {
        text: 'text-[#C24428]',
        icon: 'text-[#E1553C]',
        softBtn: 'bg-[#FDEDE8] text-[#C24428] hover:bg-[#FBE0D8] border-[#F3D9D1]',
        softHoverOnGray: 'hover:text-[#C24428] hover:bg-[#FDEDE8]',
        hoverText: 'hover:text-[#C24428]',
        panel: 'bg-[#FDF8F6] border-[#F3D9D1]',
        chip: 'bg-[#FDEDE8]',
        chipAlt: 'bg-[#FDEDE8]',
        chipAltIcon: 'text-[#E1553C]',
        chipAltPill: 'bg-[#FDEDE8] text-[#C24428]',
        barSoft: 'bg-[#FDEDE8]',
        solid: 'bg-[#E1553C] shadow-[#F3D9D1]',
        onSolid: 'text-[#C24428]',
        ring: 'focus:ring-[#E1553C]',
        borderHover: 'hover:border-[#E1553C]',
        spinner: 'border-[#E1553C]',
        negotiateBtn: 'bg-[#FDEDE8] text-[#C24428] hover:bg-[#FBE0D8] border-[#F3D9D1]',
        // Dentro do card sólido coral, âmbar brigaria — usa a mesma superfície
        // translúcida do botão "Negociar Condições".
        onSolidSecondary: 'bg-white/10 text-white hover:bg-white/20 border border-white/20',
    },
} as const;

// §8: texto colorido simples — sem pílula, fundo ou uppercase.
const getStatusStyles = (status: string) => {
    switch (status) {
        case 'Rascunho': return 'text-gray-600';
        case 'Enviado': return 'text-blue-600';
        case 'Confirmado': return 'text-emerald-600';
        case 'Separação': return 'text-amber-600';
        case 'Em Trânsito': return 'text-indigo-600';
        case 'Entregue':
        case 'Recebido': return 'text-green-600';
        case 'Divergência': return 'text-red-600';
        case 'Cancelado': return 'text-gray-400';
        default: return 'text-gray-600';
    }
};

const SupplyChainOrderDetails: React.FC<SupplyChainOrderDetailsProps> = ({ orderId, onBack, initialView = 'details', currentUser: propUser, portalToken, accent = 'indigo' }) => {
    const A = ACCENTS[accent];
    const [showReceiptModal, setShowReceiptModal] = React.useState(false);
    const [viewMode, setViewMode] = React.useState<'details' | 'logistics'>(initialView);
    // Abas do pedido (§19.1). O pedido deixou de ter tela de edição separada: o
    // formulário vive DENTRO destas abas, abaixo dos cartões de leitura.
    //  · Dados Gerais  — formulário do pedido (as observações ficam na coluna
    //                     da direita, abaixo do cartão de status)
    //  · Itens do Pedido — tabela do pedido + itens avulsos e materiais da obra
    //  · Recebimento   — 3-way match, comprovantes e divergências
    //  · Comunicação   — chat do pedido com o time de compras
    // Cabeçalho, cartão de status, notificações e chat ficam FORA das abas.
    const [abaDetalhe, setAbaDetalhe] = React.useState<'dados' | 'itens' | 'financeiro' | 'recebimento' | 'comunicacao'>('dados');
    const [order, setOrder] = React.useState<PurchaseOrder | null>(null);
    const [supplierName, setSupplierName] = React.useState('');
    const [supplierEmail, setSupplierEmail] = React.useState('');
    const [projectName, setProjectName] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [showNegotiation, setShowNegotiation] = React.useState(false);
    const [currentUser, setCurrentUser] = React.useState<{ email: string; name: string } | null>(propUser || null);
    const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
    const [editQty, setEditQty] = React.useState<number>(0);
    const [editPrice, setEditPrice] = React.useState<number>(0);
    const [editDescription, setEditDescription] = React.useState<string>('');
    const [editUnit, setEditUnit] = React.useState<string>('');
    const [receipts, setReceipts] = React.useState<PurchaseReceipt[]>([]);
    // Bucket 'receipts' é privado: photo_path guarda o PATH; resolvemos signed URL
    // (15min) por path para exibir a foto do comprovante. (Fase 1 privatização storage.)
    const [receiptPhotoUrls, setReceiptPhotoUrls] = React.useState<Record<string, string>>({});
    const [discrepancies, setDiscrepancies] = React.useState<PurchaseDiscrepancy[]>([]);
    const [notifLogs, setNotifLogs] = React.useState<NotificationLogEntry[]>([]);
    const [resolutionInputs, setResolutionInputs] = React.useState<Record<string, string>>({});
    const [resolvingId, setResolvingId] = React.useState<string | null>(null);
    const [isSendingWhatsApp, setIsSendingWhatsApp] = React.useState(false);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);
    // "Regerar número" — Configurações do Sistema › Nomenclatura aplicada a um
    // pedido já existente. Trava: qualquer status ≠ 'Rascunho'.
    const [numberLockReason, setNumberLockReason] = React.useState<string | null>(null);
    const [isRegeneratingNumber, setIsRegeneratingNumber] = React.useState(false);

    const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const askConfirm = (message: string, onConfirm: () => void) => {
        setPendingConfirm({ message, onConfirm });
    };

    React.useEffect(() => {
        if (!order?.id) { setNumberLockReason(null); return; }
        let cancelled = false;
        getOrderNumberLockReason(order.id)
            .then(r => { if (!cancelled) setNumberLockReason(r); })
            // Falha ao consultar a trava não pode liberar o botão: na dúvida, bloqueia.
            .catch(() => { if (!cancelled) setNumberLockReason('Não foi possível verificar se o número pode ser alterado.'); });
        return () => { cancelled = true; };
    }, [order?.id]);

    const handleRegenerateOrderNumber = async () => {
        if (!order) return;
        askConfirm(
            `O número atual (${order.number ?? '—'}) será substituído por um novo, gerado pela máscara vigente em Configurações do Sistema › Nomenclatura. O anterior fica registrado no histórico. A troca é gravada na hora.`,
            () => {
                (async () => {
                    setIsRegeneratingNumber(true);
                    try {
                        const project = order.projectId ? await projectService.loadProject(order.projectId) : null;
                        const organizationId = (project as { organization_id?: string } | null)?.organization_id;
                        if (!organizationId) throw new Error('Não foi possível identificar a organização deste pedido.');

                        const novo = await regenerateOrderNumber(order.id, organizationId, {
                            projectId: order.projectId || undefined,
                            supplierId: order.supplierId || undefined,
                            costCenterId: order.costCenterId || undefined,
                        });
                        setOrder(prev => (prev ? { ...prev, number: novo } : prev));
                        notify(`Número regerado: ${novo}`);
                    } catch (err: unknown) {
                        const error = err instanceof Error ? err : new Error(String(err));
                        notify(`Erro ao regerar o número: ${error.message}`, 'error');
                    } finally {
                        setIsRegeneratingNumber(false);
                    }
                })();
            },
        );
    };

    const handleUpdateStatus = async (newStatus: PurchaseOrder['status']) => {
        try {
            setLoading(true);
            if (portalToken) {
                await supplierPortalTokenService.updateOrderLogistics(portalToken, orderId, { status: newStatus });
            } else {
                await orderService.updateOrder(orderId, { status: newStatus }, order?.version);
            }
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

                if (portalToken) {
                    // Modo link público: só o pedido carrega por aqui — sem recibos/
                    // divergências/logs, que são ferramentas internas de compras (ver
                    // comentário no prop). Notas fiscais moraram aqui e viraram a aba
                    // dedicada Nota Fiscal do portal (ver 2026-08-21).
                    const res = await supplierPortalTokenService.getOrderDetail(portalToken, orderId);
                    if (cancelled) return;
                    if (res.valid && res.order) {
                        setOrder(res.order);
                        setSupplierName(propUser?.name || 'Fornecedor');
                        setSupplierEmail(propUser?.email || '');
                    }
                    return;
                }

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

                    const orderReceipts = await receiptService.listByOrder(orderId);
                    if (cancelled) return;
                    setReceipts(orderReceipts);
                    resolveReceiptPhotos(orderReceipts);

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
    }, [orderId, portalToken]);

    // Resolve signed URLs (15min) para as fotos dos comprovantes (bucket privado).
    const resolveReceiptPhotos = async (list: PurchaseReceipt[]) => {
        const paths = Array.from(new Set(list.map(r => r.photoPath).filter((p): p is string => !!p)));
        if (paths.length === 0) return;
        const entries = await Promise.all(
            paths.map(async (path) => {
                try {
                    return [path, await storageService.createSignedUrl('receipts', path, 60 * 15)] as const;
                } catch {
                    return [path, ''] as const;
                }
            })
        );
        setReceiptPhotoUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    };

    const loadOrderData = async (): Promise<PurchaseOrder | null> => {
        try {
            if (portalToken) {
                const res = await supplierPortalTokenService.getOrderDetail(portalToken, orderId);
                if (!res.valid || !res.order) return null;
                setOrder(res.order);
                return res.order;
            }

            const [allOrders, orderReceipts, orderDiscrepancies, orderNotifLogs] = await Promise.all([
                orderService.listOrders(),
                receiptService.listByOrder(orderId),
                discrepancyService.listByOrder(orderId),
                notificationLogService.listByOrder(orderId),
            ]);
            const foundOrder = allOrders.find(o => o.id === orderId) || null;
            if (foundOrder) setOrder(foundOrder);
            setReceipts(orderReceipts);
            resolveReceiptPhotos(orderReceipts);
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
            notify(error instanceof Error ? error.message : "Erro ao duplicar o pedido.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsAppShare = async () => {
        if (!order) return;

        // WhatsApp Cloud API (oficial) — envia template com link público do pedido
        if (whatsappService.isConfigured()) {
            try {
                setIsSendingWhatsApp(true);
                const supplier = await supplierService.getById(order.supplierId);
                if (!supplier?.phone) {
                    notify('Fornecedor sem telefone cadastrado. Adicione o telefone na ficha do fornecedor.', 'error');
                    return;
                }
                const shareToken = await whatsappService.generateShareToken(order.id);
                const total = order.items.reduce((sum, item) => sum + (item.total || 0), 0);
                await whatsappService.sendOrderTemplate({
                    phone:        supplier.phone,
                    orderId:      order.id,
                    supplierName: supplier.name,
                    orderNumber:  order.number || order.id,
                    projectName,
                    itemCount:    order.items.length,
                    total,
                    deliveryDate: order.deliveryDate,
                    shareToken,
                });
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
        let text = `*Pedido de Compra #${order.number}* - Opura\n`;
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
                <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${A.spinner}`}></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Pedido não encontrado.</p>
                <button onClick={onBack} className={`mt-4 hover:underline ${A.text}`}>Voltar</button>
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
                        className={`flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest transition-colors group ${A.hoverText}`}
                    >
                        <ArrowLeft className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                        Voltar para Pedidos
                    </button>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setViewMode('details')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${A.softBtn}`}
                        >
                            <FileText className="w-3 h-3" />
                            Ver Detalhes do Pedido
                        </button>
                        <div className="text-right">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Rastreamento Logístico</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Pedido: {order.number}</p>
                        </div>
                    </div>
                </div>

                <div className="py-12">
                    <OrderLifeline
                        accent={accent}
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

                <div className={`mt-12 p-8 rounded-3xl border grid grid-cols-1 md:grid-cols-3 gap-8 ${A.panel}`}>
                    <div>
                        <p className={`text-xs font-black uppercase tracking-widest mb-2 ${A.text}`}>Previsão de Entrega</p>
                        <p className="text-sm font-bold text-gray-900">{order.deliveryDate ? new Date(order.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não informada'}</p>
                    </div>
                    <div>
                        <p className={`text-xs font-black uppercase tracking-widest mb-2 ${A.text}`}>Fornecedor</p>
                        <p className="text-sm font-bold text-gray-900">{supplierName}</p>
                    </div>
                    <div>
                        <p className={`text-xs font-black uppercase tracking-widest mb-2 ${A.text}`}>Status Atual</p>
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
                            <button onClick={() => setPendingConfirm(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl text-button font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Cancelar</button>
                            <button onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }} className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-red-600 transition-all">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
            </>
        );
    }

    return (
        <>
        <div className="space-y-6 animate-in fade-in duration-500 pb-12">
            {/* Cabeçalho §20 — h1 solto + subtitulo mt-1.5, NUNCA dentro de card
                ou hero. Mesmo desenho de Comercial > Locacao (Gestao de Unidades):
                titulo, subtitulo e, logo abaixo, a toolbar de abas. */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <button
                        onClick={onBack}
                        className="mt-1 p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group"
                        title="Voltar"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-4 flex-wrap">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedido <span className={A.text}>#{order.number}</span></h1>
                            {!portalToken && (
                                <ActionIconButton
                                    kind="settings"
                                    icon={isRegeneratingNumber ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    title={numberLockReason ?? 'Regerar número pela máscara atual'}
                                    disabled={!!numberLockReason || isRegeneratingNumber}
                                    onClick={handleRegenerateOrderNumber}
                                />
                            )}
                            <span className={`text-sm font-normal ${getStatusStyles(order.status)} animate-in fade-in duration-700`}>
                                {order.status}
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" />
                                {projectName}
                            </span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : '---'}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap md:justify-end">
                    <button
                        onClick={() => setViewMode('logistics')}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium transition-all border active:scale-95 ${A.softBtn}`}
                    >
                        <Truck className="w-[15px] h-[15px]" />
                        Rastreio
                    </button>

                    {/* O botão "Editar" abria uma tela separada com os mesmos campos.
                        A edição passou para dentro das abas desta tela (o formulário
                        vem abaixo dos cartões), então o botão não tem mais destino. */}

                    {!portalToken && order.status === 'Entregue' && currentUser?.email !== supplierEmail && (
                        <button
                            onClick={() => setShowReceiptModal(true)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] text-[13px] font-medium hover:bg-emerald-700 transition-all active:scale-95"
                        >
                            <CheckCircle2 className="w-[15px] h-[15px]" />
                            Receber
                        </button>
                    )}

                    <button
                        onClick={() => setShowNegotiation(true)}
                        className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-[13px] font-medium transition-all border active:scale-95 ${A.negotiateBtn}`}
                    >
                        <Gavel className="w-[15px] h-[15px]" />
                        Negociar
                    </button>

                    {/* Automação, duplicar, excluir e WhatsApp são ferramentas administrativas do
                        time de compras — indisponíveis no link público (§ mesma razão de excluir/
                        duplicar já combinada: ação destrutiva/administrativa não pertence a um link
                        copiável por qualquer um). */}
                    {!portalToken && (
                        <button
                            onClick={handleSendWebhook}
                            disabled={loading}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all text-[13px] font-medium disabled:opacity-50 active:scale-95"
                            title="Enviar para Automação (Make.com)"
                        >
                            <Zap className="w-[15px] h-[15px]" />
                            Enviar automação
                        </button>
                    )}

                    <button
                        onClick={() => window.print()}
                        className="h-9 w-9 flex items-center justify-center bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 rounded-[6px] transition-all shadow-sm active:scale-95"
                        title="Imprimir Pedido"
                    >
                        <Printer className="w-4 h-4" />
                    </button>

                    {!portalToken && (
                        <>
                            <ActionIconButton kind="duplicate" title="Duplicar Pedido" onClick={handleDuplicateOrder} />

                            <ActionIconButton
                                kind="delete"
                                disabled={!canDeleteOrder(order.status)}
                                title={canDeleteOrder(order.status) ? 'Excluir Pedido' : `Pedido "${order.status}" não pode ser excluído`}
                                onClick={handleDeleteOrder}
                            />

                            <button
                                onClick={handleWhatsAppShare}
                                disabled={isSendingWhatsApp}
                                className="h-9 w-9 flex items-center justify-center bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 rounded-[6px] transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                title={whatsappService.isConfigured() ? 'Enviar WhatsApp (API Oficial)' : 'Compartilhar via WhatsApp'}
                            >
                                {isSendingWhatsApp
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <MessageCircle className="w-4 h-4 fill-current" />
                                }
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Abas — §19.1: trilho cinza dentro de card branco, abas h-7, ativa =
                bg-white + cor do acento (estado de navegação, não ação). O acento
                sai do mapa ACCENTS, então o portal externo (§24) mantém o coral. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {([
                        { id: 'dados', label: 'Dados Gerais', icon: FileText },
                        { id: 'itens', label: 'Itens do Pedido', icon: Package },
                        { id: 'financeiro', label: 'Financeiro', icon: HandCoins },
                        { id: 'recebimento', label: 'Recebimento', icon: Truck },
                        { id: 'comunicacao', label: 'Comunicação', icon: MessageCircle },
                    ] as const).map(aba => (
                        <button
                            key={aba.id}
                            type="button"
                            onClick={() => setAbaDetalhe(aba.id)}
                            className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${abaDetalhe === aba.id
                                ? `bg-white ${A.text} shadow-sm`
                                : 'text-gray-700 hover:text-gray-900'
                                }`}
                        >
                            <aba.icon className="w-4 h-4" />
                            {aba.label}
                            {aba.id === 'itens' && (order.items?.length ?? 0) > 0 && (
                                <span className="text-gray-400">{order.items.length}</span>
                            )}
                            {aba.id === 'recebimento' && discrepancies.length > 0 && (
                                <span className="text-amber-600">{discrepancies.length}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Conteúdo em duas colunas: as abas à esquerda, o cartão de status
                fixo à direita (§16 compacto). Ele valia para as cinco abas e,
                em largura cheia, empurrava o conteúdo para baixo da dobra. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                {/* Os cartões de leitura Fornecedor / Logística / Pagamento moravam
                    aqui, acima do formulário. Eram os MESMOS campos que o
                    formulário logo abaixo já mostra (e deixa editar) — leitura e
                    edição do mesmo dado, uma em cima da outra. Removidos a pedido
                    do usuário em 2026-09-04; a aba começa direto no formulário. */}

                {/* O "Fluxo de Atendimento" (OrderLifeline) morava aqui e era
                    exatamente a mesma linha do tempo da tela de Logística do
                    pedido — dois lugares mostrando o mesmo dado. Ficou só na
                    tela dedicada, alcançável pelo botão "Rastreio" do
                    cabeçalho (e pelo botão "Logística do pedido" da lista).
                    Removido a pedido do usuário em 2026-08-20. */}

                {/* ── Aba "Itens do Pedido": tabela do pedido (leitura) ── */}
                {abaDetalhe === 'itens' && (
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${A.chipAlt}`}>
                                <Package className={`w-4 h-4 ${A.chipAltIcon}`} />
                            </div>
                            Itens do Pedido
                            <span className={`ml-2 px-2 py-0.5 rounded-lg text-xs ${A.chipAltPill}`}>{order.items.length} itens</span>
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        {/* min-w: 7 colunas com px-6 não cabem na coluna de
                            conteúdo do portal (sidebar de 64) — rola dentro
                            do card em vez de espremer a descrição */}
                        <table className="w-full min-w-[760px] text-left text-sm border-collapse">
                            {/* §6.2 sentence case + §6.6 px-6 e separador vertical */}
                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-2 border-r border-gray-100">Código</th>
                                    <th className="px-6 py-2 border-r border-gray-100">Descrição</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Qtd</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Un</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Unitário</th>
                                    <th className="px-6 py-2 border-r border-gray-100 text-right">Total</th>
                                    <th className="px-6 py-2 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {order.items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{item.code}</td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700 max-w-xs">
                                            {editingIndex === idx ? (
                                                <input
                                                    type="text"
                                                    value={editDescription}
                                                    onChange={(e) => setEditDescription(e.target.value)}
                                                    className={`w-full border border-gray-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 ${A.ring}`}
                                                />
                                            ) : item.description}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-600">
                                            {editingIndex === idx ? (
                                                <input
                                                    type="number"
                                                    value={editQty}
                                                    onChange={(e) => setEditQty(parseFloat(e.target.value) || 0)}
                                                    className={`w-20 text-right border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 ${A.ring}`}
                                                />
                                            ) : item.quantity}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-600">
                                            {editingIndex === idx ? (
                                                <input
                                                    type="text"
                                                    value={editUnit}
                                                    onChange={(e) => setEditUnit(e.target.value)}
                                                    className={`w-16 text-center border border-gray-300 rounded px-2 py-1 text-form-input outline-none focus:ring-2 ${A.ring}`}
                                                />
                                            ) : item.unit}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800">
                                            {editingIndex === idx ? (
                                                <input
                                                    type="number"
                                                    value={editPrice}
                                                    onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                                                    className={`w-24 text-right border border-gray-300 rounded px-2 py-1 outline-none focus:ring-2 ${A.ring}`}
                                                />
                                            ) : (
                                                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)
                                            )}
                                        </td>
                                        <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800 bg-gray-50/30">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(editingIndex === idx ? (editQty * editPrice) : item.total)}
                                        </td>
                                        <td className="px-6 py-2.5 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
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
                                                ) : !portalToken ? (
                                                    <>
                                                        {/* §9: ação sempre visível — nunca opacity-0 + group-hover */}
                                                        <ActionIconButton kind="edit" size="sm" onClick={() => handleStartEdit(idx, item)} />
                                                        <ActionIconButton kind="delete" size="sm" onClick={() => handleDeleteItem(idx)} />
                                                    </>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-900 text-white">
                                <tr>
                                    <td colSpan={6} className="px-6 py-4 text-right text-sm font-normal opacity-60">Valor total do pedido</td>
                                    <td className="px-6 py-4 text-right text-xl font-medium">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                )}

                {/* O cartão "Observações" saiu daqui: passou para a coluna da
                    direita, logo abaixo do cartão de Status interno (pedido do
                    usuário em 2026-09-04). */}

                {/* Formulário do pedido, embutido: é o conteúdo que morava na tela
                    "Editar pedido". UMA instância só, com a aba mandando em qual
                    grupo de painéis aparece — montar/desmontar por aba perderia o
                    que o usuário digitou ao trocar de aba. Escondido (não
                    desmontado) nas abas que nao editam (Recebimento, Comunicacao) pelo
                    mesmo motivo.
                    Fora do portal do fornecedor: quem edita o pedido é o comprador. */}
                {!portalToken && (
                    <div className={abaDetalhe === 'dados' || abaDetalhe === 'itens' || abaDetalhe === 'financeiro' ? '' : 'hidden'}>
                        <SupplyChainOrderForm
                            embedded
                            painel={abaDetalhe === 'itens' || abaDetalhe === 'financeiro' ? abaDetalhe : 'dados'}
                            editingOrderId={order.id}
                            onBack={() => { /* sem "voltar": a tela é o detalhe */ }}
                            onSave={() => { loadOrderData(); }}
                        />
                    </div>
                )}

                {/* ── Aba "Recebimento" ── */}
                {/* 3-Way Match — ferramenta interna de conferência (compra × NFe × recebimento),
                    fora do escopo do link público */}
                {abaDetalhe === 'recebimento' && !portalToken && <ThreeWayMatchPanel orderId={order.id} />}

                {/* Receipts from purchase_receipts table */}
                {abaDetalhe === 'recebimento' && receipts.length > 0 && (
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
                                            <Package className={`w-4 h-4 ${A.chipAltIcon}`} />
                                        )}
                                        {receipt.status === 'Parcial' ? 'Recebimento Parcial' : `Conferência de Entrega`}
                                        {receipts.length > 1 && (
                                            <span className="text-xs font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">#{receipts.length - rIdx}</span>
                                        )}
                                    </h3>
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                                        {new Date(receipt.receivedAt).toLocaleString('pt-BR')}
                                    </span>
                                </div>

                                {receipt.items.length > 0 && (
                                    <div className="overflow-x-auto rounded-xl border border-gray-100">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                                <tr>
                                                    <th className="px-6 py-2 text-left border-r border-gray-100">Item</th>
                                                    <th className="px-6 py-2 text-right border-r border-gray-100">Pedido</th>
                                                    <th className="px-6 py-2 text-right">Recebido</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {receipt.items.map(item => {
                                                    const isShort = item.quantityReceived < item.quantityOrdered;
                                                    return (
                                                        <tr key={item.orderItemCode} className={isShort ? 'bg-amber-50/50' : ''}>
                                                            <td className="px-6 py-2.5 border-r border-gray-100">
                                                                <p className="text-sm font-normal text-gray-700">{item.description}</p>
                                                                {item.issue && (
                                                                    <p className="text-xs text-amber-600 mt-0.5">{item.issue}</p>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-600">
                                                                {item.quantityOrdered} {item.unit}
                                                            </td>
                                                            <td className={`px-6 py-2.5 text-right text-sm font-normal ${isShort ? 'text-amber-600' : 'text-emerald-600'}`}>
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
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Observações</p>
                                        <p className="text-sm text-gray-700 italic">"{receipt.notes}"</p>
                                    </div>
                                )}

                                {receipt.photoPath && receiptPhotoUrls[receipt.photoPath] && (
                                    <a
                                        href={receiptPhotoUrls[receipt.photoPath]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`block relative group overflow-hidden rounded-xl border-2 border-gray-100 transition-all aspect-video bg-gray-50 ${A.borderHover}`}
                                    >
                                        <img
                                            src={receiptPhotoUrls[receipt.photoPath]}
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

                {/* §12 — no portal do fornecedor não há 3-way match: sem comprovante
                    nem divergência, a aba ficaria em branco. */}
                {abaDetalhe === 'recebimento' && portalToken && receipts.length === 0 && discrepancies.length === 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 text-center py-12">
                        <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nada recebido ainda</h3>
                        <p className="text-sm text-gray-500">Os comprovantes de entrega e as divergências aparecem aqui assim que o recebimento for registrado.</p>
                    </div>
                )}

                {/* Discrepancy Workflow — divergência é sempre sobre item recebido */}
                {abaDetalhe === 'recebimento' && discrepancies.length > 0 && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">
                                Divergências
                            </h3>
                            <span className="ml-auto px-2 py-0.5 rounded-lg text-xs font-black bg-amber-100 text-amber-700">
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
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {d.quantity} {d.unit} —{' '}
                                                    <span className="font-bold text-amber-600 uppercase">{d.issue}</span>
                                                </p>
                                            </div>
                                            <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusColors[d.status]}`}>
                                                {d.status}
                                            </span>
                                        </div>

                                        {d.resolutionNotes && (
                                            <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2">
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
                                                    className="w-full text-form-input rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300 bg-white"
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


                {/* "Documentos Fiscais" (upload + lista de NFe) morava aqui e
                    duplicava telas já dedicadas a nota fiscal: a aba Nota Fiscal
                    do fornecedor (InvoiceManager/PortalInvoices) e, do lado do
                    comprador, Financeiro › Contas a Pagar › aba Notas. Mesmo
                    dado, dois lugares — removido a pedido do usuário em
                    2026-08-21 (mesmo raciocínio da remoção do Fluxo de
                    Atendimento em 2026-08-20). */}

                {/* Notification Log — e-mail, WhatsApp e webhook disparados para o
                    fornecedor são comunicação do pedido: vivem na aba Comunicação,
                    junto do chat. Fora das abas, apareciam repetidos nas quatro. */}
                {abaDetalhe === 'comunicacao' && notifLogs.length > 0 && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${A.chipAlt}`}>
                                <Zap className={`w-4 h-4 ${A.chipAltIcon}`} />
                            </div>
                            Histórico de Notificações
                            <span className="ml-auto text-xs font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{notifLogs.length}</span>
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
                                                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">{channelLabel}</span>
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                                                    log.status === 'sent'   ? 'bg-emerald-100 text-emerald-700' :
                                                    log.status === 'failed' ? 'bg-red-100 text-red-600' :
                                                                               'bg-amber-100 text-amber-700'
                                                }`}>{log.status === 'sent' ? 'Enviado' : log.status === 'failed' ? 'Falhou' : 'Pendente'}</span>
                                            </div>
                                            {log.recipient && (
                                                <p className="text-xs text-gray-500 font-medium truncate mt-0.5">{log.recipient}</p>
                                            )}
                                            {log.subject && (
                                                <p className="text-xs text-gray-700 font-bold truncate">{log.subject}</p>
                                            )}
                                            {log.error && (
                                                <p className="text-xs text-red-500 mt-0.5 truncate" title={log.error}>{log.error}</p>
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

                {/* ── Aba "Comunicação" ── */}
                {/* Chat Section — canal interno de compras, fora do escopo do link público
                    (exige sessão authenticated; sem RPC de token para isto ainda) */}
                {abaDetalhe === 'comunicacao' && !portalToken && currentUser && (
                    <OrderChat
                        orderId={orderId}
                        currentUser={currentUser}
                    />
                )}

                {/* §12 — no link público (e sem sessão) não há chat: a aba não pode
                    ficar em branco. */}
                {abaDetalhe === 'comunicacao' && (portalToken || !currentUser) && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 text-center py-12">
                        <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Conversa indisponível aqui</h3>
                        <p className="text-sm text-gray-500">O chat do pedido é o canal interno do time de compras e exige sessão no sistema.</p>
                    </div>
                )}
                </div>

                {/* O sticky vive no CONTAINER, não no cartão de status: com o
                    cartão de Observações abaixo dele, sticky no cartão faria o de
                    baixo rolar por trás do que ficou preso. */}
                <div className="space-y-6 lg:sticky lg:top-6">
                    <div className={`p-5 rounded-[10px] shadow-sm flex flex-col gap-4 text-white relative overflow-hidden ${A.solid}`}>
                        <div className="absolute -top-10 -right-10 w-24 h-24 bg-white/10 rounded-full blur-2xl" />

                        <div>
                            <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-1">Status interno</h3>
                            <p className="text-sm font-medium leading-snug">
                                Este pedido encontra-se no estágio de <span className="bg-white/20 px-2 py-0.5 rounded-md text-white">{order.status}</span>.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 pt-4 border-t border-white/10">
                            {order.status === 'Rascunho' && (
                                <button
                                    onClick={() => handleUpdateStatus('Enviado')}
                                    className={`w-full h-9 bg-white rounded-[6px] text-[13px] font-medium hover:bg-gray-50 transition-all active:scale-95 ${A.onSolid}`}
                                >
                                    Enviar para fornecedor
                                </button>
                            )}

                            {order.status === 'Enviado' && (() => {
                                const isSupplier = currentUser && supplierEmail &&
                                    currentUser.email.toLowerCase() === supplierEmail.toLowerCase();

                                return isSupplier ? (
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => handleUpdateStatus('Confirmado')}
                                            className="w-full h-9 bg-emerald-500 text-white rounded-[6px] text-[13px] font-medium hover:bg-emerald-600 transition-all active:scale-95 border border-emerald-400"
                                        >
                                            Confirmar pedido
                                        </button>
                                        <button
                                            onClick={() => setShowNegotiation(true)}
                                            className="w-full h-9 bg-white/10 text-white rounded-[6px] text-[13px] font-medium hover:bg-white/20 transition-all border border-white/20 active:scale-95"
                                        >
                                            Negociar condições
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-white/10 rounded-[6px] border border-white/10 backdrop-blur-sm">
                                        <p className="text-xs text-white/80 font-medium">
                                            Aguardando aceite do fornecedor…
                                        </p>
                                    </div>
                                );
                            })()}

                            {order.status === 'Em Negociação' && (
                                <button
                                    onClick={() => setShowNegotiation(true)}
                                    className={`w-full h-9 rounded-[6px] text-[13px] font-medium transition-all active:scale-95 ${A.onSolidSecondary}`}
                                >
                                    Entrar na sala de negociação
                                </button>
                            )}

                            {(order.status === 'Rascunho' || order.status === 'Enviado') && (
                                <button
                                    onClick={() => handleUpdateStatus('Cancelado')}
                                    className="w-full h-9 border border-white/20 text-white/70 rounded-[6px] text-[13px] font-medium hover:bg-white/10 transition-all active:scale-95"
                                >
                                    Cancelar pedido
                                </button>
                            )}

                            {order.status === 'Confirmado' && (
                                <div className="p-3 bg-white/10 rounded-[6px] border border-white/10">
                                    <p className="text-xs text-white font-semibold mb-1.5 flex items-center gap-2">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Confirmado
                                    </p>
                                    <p className="text-xs text-white/70 leading-relaxed font-medium">
                                        O fornecedor aceitou o pedido. Aguarde a atualização das etapas de logística.
                                    </p>
                                </div>
                            )}

                            {['Entregue', 'Recebido', 'Divergência'].includes(order.status) && (
                                <button
                                    onClick={() => handleUpdateStatus('Cancelado')}
                                    className="w-full h-9 border border-white/20 text-white/70 rounded-[6px] text-[13px] font-medium hover:bg-white/10 transition-all active:scale-95"
                                >
                                    Cancelar pedido
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Observações do comprador — leitura. Fica logo abaixo do
                        Status interno, na mesma coluna (§16: escala compacta,
                        igual ao cartão de cima). */}
                    {abaDetalhe === 'dados' && (
                        <div className="bg-white p-5 rounded-[10px] shadow-sm border border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <div className={`p-1.5 rounded-[6px] ${A.chip}`}>
                                    <FileText className={`w-3.5 h-3.5 ${A.icon}`} />
                                </div>
                                Observações
                            </h3>
                            <div className="relative">
                                <div className={`absolute top-0 left-0 w-1 h-full rounded-full ${A.barSoft}`} />
                                <p className="text-sm text-gray-600 pl-4 py-1 italic leading-relaxed">
                                    {order.notes || "Nenhuma observação registrada pelo comprador."}
                                </p>
                            </div>
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
                            accent={accent}
                            order={order}
                            currentUserEmail={currentUser.email}
                            currentUserRole={
                                currentUser.email.toLowerCase() === supplierEmail.toLowerCase()
                                    ? 'supplier' : 'buyer'
                            }
                            onClose={() => setShowNegotiation(false)}
                            onUpdate={() => loadOrderData()}
                            portalToken={portalToken}
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
                        <button onClick={() => setPendingConfirm(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-2xl text-button font-black uppercase tracking-widest hover:bg-gray-200 transition-all">Cancelar</button>
                        <button onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }} className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-button font-black uppercase tracking-widest hover:bg-red-600 transition-all">Confirmar</button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default SupplyChainOrderDetails;
