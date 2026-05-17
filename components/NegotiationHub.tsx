import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Gavel, User, Send, Calendar, Tag, CheckCircle2, History, X } from 'lucide-react';
import { PurchaseOrder, PurchaseOrderItem } from '../types';
import { negotiationService, NegotiationProposal } from '../services/negotiationService';

interface NegotiationHubProps {
    order: PurchaseOrder;
    currentUserEmail: string;
    currentUserRole: 'buyer' | 'supplier';
    onClose?: () => void;
    onUpdate?: () => void;
}

const NegotiationHub: React.FC<NegotiationHubProps> = ({ order, currentUserEmail, currentUserRole, onClose, onUpdate }) => {
    const [proposals, setProposals] = useState<NegotiationProposal[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [proposedDate, setProposedDate] = useState(order.deliveryDate || '');
    const [proposedItems, setProposedItems] = useState<PurchaseOrderItem[]>([...order.items]);
    const [proposedPaymentMethod, setProposedPaymentMethod] = useState(order.paymentMethod || 'Boleto');
    const [proposedTermType, setProposedTermType] = useState<'Vista' | 'Parcelado'>(order.paymentTermType || 'Vista');
    const [proposedDays, setProposedDays] = useState(order.paymentDays || 30);
    const [proposedInstallments, setProposedInstallments] = useState(order.paymentInstallments || 1);

    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadProposals();
    }, [order.id]);

    useEffect(() => {
        scrollToBottom();
    }, [proposals]);

    const loadProposals = async () => {
        try {
            const data = await negotiationService.listProposals(order.id);
            setProposals(data);
        } catch (error) {
            console.error('Error loading proposals:', error);
        } finally {
            setLoading(false);
        }
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handlePriceChange = (index: number, newPrice: number) => {
        const newItems = [...proposedItems];
        newItems[index] = {
            ...newItems[index],
            unitPrice: newPrice,
            total: newPrice * newItems[index].quantity
        };
        setProposedItems(newItems);
    };

    const handleSubmitProposal = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            await negotiationService.createProposal({
                orderId: order.id,
                senderEmail: currentUserEmail,
                senderRole: currentUserRole,
                deliveryDate: proposedDate,
                items: proposedItems,
                paymentMethod: proposedPaymentMethod,
                paymentTermType: proposedTermType,
                paymentDays: proposedDays,
                paymentInstallments: proposedInstallments,
                message: message.trim()
            });
            setMessage('');
            await loadProposals();
            onUpdate?.();
        } catch (error) {
            console.error('Error submitting proposal:', error);
            alert('Erro ao enviar contraproposta.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAccept = async (proposalId: string) => {
        if (!confirm('Deseja aceitar esta contraproposta? Isso atualizará o pedido final.')) return;
        try {
            await negotiationService.acceptProposal(proposalId, order.id);
            await loadProposals();
            onUpdate?.();
            onClose?.();
        } catch (error) {
            console.error('Error accepting proposal:', error);
            alert('Erro ao aceitar proposta.');
        }
    };

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    if (loading) return <div className="p-8 text-center animate-pulse font-bold text-gray-400">CARREGANDO NEGOCIAÇÃO...</div>;

    return (
        <div className="flex flex-col h-[750px] bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <Gavel className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Sala de Negociação</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pedido {order.number} • {order.projectName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{order.status}</span>
                    </div>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-all active:scale-95"
                            title="Fechar"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Chat History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
                    {proposals.length === 0 && (
                        <div className="text-center py-20">
                            <MessageSquare className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">Nenhuma proposta enviada ainda.</p>
                        </div>
                    )}

                    {proposals.map((prop) => {
                        const isMine = prop.senderEmail === currentUserEmail;
                        const isAccepted = prop.status === 'accepted';

                        return (
                            <div key={prop.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-5 rounded-[2rem] shadow-sm border ${isMine
                                    ? 'bg-black text-white border-black rounded-tr-none'
                                    : 'bg-white text-gray-900 border-gray-100 rounded-tl-none'
                                    } ${isAccepted ? 'ring-2 ring-emerald-500' : ''}`}>
                                    <div className={`flex items-center gap-2 mb-3 text-[10px] font-black uppercase tracking-widest ${isMine ? 'text-gray-400' : 'text-indigo-600'}`}>
                                        <User className="w-3 h-3" />
                                        {prop.senderRole === 'buyer' ? 'Comprador' : 'Fornecedor'} ({prop.senderEmail})
                                    </div>

                                    {prop.message && (
                                        <p className="text-sm font-medium leading-relaxed mb-4 italic opacity-90 underline decoration-indigo-500/30 underline-offset-4">
                                            "{prop.message}"
                                        </p>
                                    )}

                                    <div className={`p-4 rounded-2xl mb-4 space-y-2 ${isMine ? 'bg-gray-900' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider opacity-70">
                                            <Calendar className="w-3 h-3" />
                                            Data Proposta: {new Date(prop.deliveryDate).toLocaleDateString('pt-BR')}
                                        </div>
                                        <div className="space-y-1">
                                            {prop.items.map((item, idx) => (
                                                <div key={idx} className="flex justify-between text-[11px] font-bold">
                                                    <span className="opacity-70 truncate max-w-[150px]">{item.description}</span>
                                                    <span>{fmt(item.unitPrice)}</span>
                                                </div>
                                            ))}
                                            <div className="pt-2 mt-2 border-t border-white/10 flex justify-between text-xs font-black">
                                                <span className="uppercase tracking-widest">Total Oferecido</span>
                                                <span className={isMine ? 'text-emerald-400' : 'text-indigo-600'}>
                                                    {fmt(prop.items.reduce((s, i) => s + (i.total || 0), 0))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-2 mt-2 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold opacity-70 mb-4">
                                        <div className="flex items-center gap-1">
                                            <Tag className="w-3 h-3" />
                                            {prop.paymentMethod || 'Não definido'}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <History className="w-3 h-3" />
                                            {prop.paymentTermType === 'Parcelado' ? `${prop.paymentInstallments}x de ${fmt((prop.items.reduce((s, i) => s + (i.total || 0), 0)) / (prop.paymentInstallments || 1))}` : 'À Vista'}
                                        </div>
                                        {prop.paymentDays !== undefined && (
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                Prazo: {prop.paymentDays} dias
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] opacity-40 font-bold">
                                            {new Date(prop.createdAt).toLocaleTimeString('pt-BR')}
                                        </span>

                                        {!isMine && prop.status === 'pending' && (
                                            <button
                                                onClick={() => handleAccept(prop.id)}
                                                className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                            >
                                                <CheckCircle2 className="w-3 h-3" />
                                                Aceitar
                                            </button>
                                        )}

                                        {isAccepted && (
                                            <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                Aceito
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={chatEndRef} />
                </div>

                {/* Control Panel (Side) */}
                <div className="w-80 border-l border-gray-100 p-6 bg-white space-y-6">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Tag className="w-3 h-3 text-indigo-600" />
                        Sua Contraproposta
                    </h4>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Nova Data</label>
                                <input
                                    type="date"
                                    value={proposedDate}
                                    onChange={(e) => setProposedDate(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Método</label>
                                <select
                                    value={proposedPaymentMethod}
                                    onChange={(e) => setProposedPaymentMethod(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                                >
                                    <option value="Boleto">Boleto</option>
                                    <option value="PIX">PIX</option>
                                    <option value="Cartão">Cartão</option>
                                    <option value="Transferência">Transf.</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Condição</label>
                                <select
                                    value={proposedTermType}
                                    onChange={(e) => setProposedTermType(e.target.value as any)}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                                >
                                    <option value="Vista">À Vista</option>
                                    <option value="Parcelado">Parcelado</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Prazo (Dias)</label>
                                <input
                                    type="number"
                                    value={proposedDays}
                                    onChange={(e) => setProposedDays(parseInt(e.target.value) || 0)}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                                />
                            </div>
                        </div>

                        {proposedTermType === 'Parcelado' && (
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 px-1">Nr. Parcelas</label>
                                <input
                                    type="number"
                                    value={proposedInstallments}
                                    onChange={(e) => setProposedInstallments(parseInt(e.target.value) || 1)}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-3 px-1">Preços dos Itens</label>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {proposedItems.map((item, idx) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-500 truncate mb-2">{item.description}</p>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">R$</span>
                                            <input
                                                type="number"
                                                value={item.unitPrice}
                                                onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                                                className="w-full bg-white border border-gray-100 rounded-lg pl-8 pr-3 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500/10"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-50">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Novo Total</span>
                                <span className="text-sm font-black text-indigo-600">
                                    {fmt(proposedItems.reduce((s, i) => s + (i.total || 0), 0))}
                                </span>
                            </div>

                            <textarea
                                placeholder="Mensagem opcional..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/10 resize-none h-20 mb-4"
                            />

                            <button
                                onClick={handleSubmitProposal}
                                disabled={submitting}
                                className="w-full bg-indigo-600 text-white py-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-indigo-100 active:scale-95 disabled:opacity-50"
                            >
                                <Send className="w-4 h-4" />
                                Enviar Proposta
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NegotiationHub;
