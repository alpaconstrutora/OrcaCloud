import React from 'react';
import {
    ArrowLeft,
    Download,
    User,
    CheckCircle2,
    DollarSign,
    Truck,
    TrendingDown,
    Calendar,
    CreditCard,
    MapPin,
    AlertTriangle,
    Send,
    X,
    XCircle,
    MessageSquare,
    Info,
    MessageCircle,
    Zap
} from 'lucide-react';
import { QuotationRequest, QuotationResponse } from '../types';
import { quotationService } from '../services/quotationService';
import { webhookService } from '../services/webhookService';
import { projectService } from '../services/projectService';
import { supplierService } from '../services/supplierService';

interface SupplyChainQuotationComparisonProps {
    requestId: string;
    onBack: () => void;
}

const SupplyChainQuotationComparison: React.FC<SupplyChainQuotationComparisonProps> = ({ requestId, onBack }) => {
    const [request, setRequest] = React.useState<QuotationRequest | null>(null);
    const [responses, setResponses] = React.useState<QuotationResponse[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [processing, setProcessing] = React.useState(false);
    const [negotiatingId, setNegotiatingId] = React.useState<string | null>(null);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [pendingConfirm, setPendingConfirm] = React.useState<{ message: string; onConfirm: () => void } | null>(null);

    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    const askConfirm = (message: string, onConfirm: () => void) => {
        setPendingConfirm({ message, onConfirm });
    };
    const [negotiationTab, setNegotiationTab] = React.useState<'form' | 'history'>('form');
    const [counterFormData, setCounterFormData] = React.useState<{
        items: { code: string; unitPrice: number }[];
        deliveryDate: string;
        deliveryMethod: string;
        deliveryLocation: string;
        paymentMethod: string;
        paymentTermType: 'Vista' | 'Parcelado';
        paymentDays: number;
        paymentInstallments: number;
    }>({
        items: [],
        deliveryDate: '',
        deliveryMethod: '',
        deliveryLocation: '',
        paymentMethod: '',
        paymentTermType: 'Vista',
        paymentDays: 30,
        paymentInstallments: 1
    });

    React.useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            try {
                const [reqs, resps] = await Promise.all([
                    quotationService.listRequests(),
                    quotationService.listResponses(requestId)
                ]);
                if (cancelled) return;
                const found = reqs.find(r => r.id === requestId);
                setRequest(found || null);
                setResponses(resps);
            } catch (err) {
                console.error("Error loading comparison data:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchData();
        return () => { cancelled = true; };
    }, [requestId]);

    const handleSelectWinner = (responseId: string) => {
        askConfirm(
            "Deseja selecionar este fornecedor como vencedor? Isso gerará um Pedido de Compra rascunho.",
            () => {
                (async () => {
                    setProcessing(true);
                    try {
                        await quotationService.selectWinner(requestId, responseId);
                        notify("Pedido gerado com sucesso!");
                        onBack();
                    } catch (err) {
                        console.error("Error selecting winner:", err);
                        notify("Erro ao selecionar vencedor.", "error");
                    } finally {
                        setProcessing(false);
                    }
                })();
            }
        );
    };

    const handleStartNegotiation = (resp: QuotationResponse, initialTab: 'form' | 'history' = 'form') => {
        setNegotiatingId(resp.id);
        setNegotiationTab(initialTab);
        setCounterFormData({
            items: resp.items.map(i => ({ code: i.code, unitPrice: i.unitPrice })),
            deliveryDate: resp.deliveryDate || '',
            deliveryMethod: resp.deliveryMethod || '',
            deliveryLocation: resp.deliveryLocation || '',
            paymentMethod: resp.paymentMethod || '',
            paymentTermType: resp.paymentTermType || 'Vista',
            paymentDays: resp.paymentDays || 30,
            paymentInstallments: resp.paymentInstallments || 1
        });
    };

    const handleNegotiationAction = (responseId: string, accept: boolean) => {
        const msg = accept ? "Deseja aceitar os valores desta proposta?" : "Deseja recusar esta proposta?";
        askConfirm(msg, () => {
            (async () => {
                setProcessing(true);
                try {
                    await quotationService.respondToCounterProposal(responseId, accept, 'Comprador');
                    notify(accept ? "Proposta aceita com sucesso!" : "Proposta recusada.");

                    // Refresh data
                    const resps = await quotationService.listResponses(requestId);
                    setResponses(resps);
                } catch (err) {
                    console.error("Error responding to negotiation:", err);
                    notify("Erro ao processar resposta.", "error");
                } finally {
                    setProcessing(false);
                }
            })();
        });
    };

    const handleSendCounterProposal = async () => {
        if (!negotiatingId) return;
        setProcessing(true);
        try {
            await quotationService.sendCounterProposal(negotiatingId, {
                items: counterFormData.items,
                deliveryDate: counterFormData.deliveryDate,
                deliveryMethod: counterFormData.deliveryMethod,
                deliveryLocation: counterFormData.deliveryLocation,
                paymentMethod: counterFormData.paymentMethod,
                paymentTermType: counterFormData.paymentTermType,
                paymentDays: counterFormData.paymentDays,
                paymentInstallments: counterFormData.paymentInstallments
            });
            notify("Contraproposta enviada com sucesso!");

            // Refresh data
            const resps = await quotationService.listResponses(requestId);
            setResponses(resps);
            setNegotiatingId(null);
        } catch (err) {
            console.error("Error sending counter proposal:", err);
            notify("Erro ao enviar contraproposta.", "error");
        } finally {
            setProcessing(false);
        }
    };

    const handleWhatsAppShare = (responseId: string) => {
        if (!request) return;
        const resp = responses.find(r => r.id === responseId);
        if (!resp) return;

        let text = `*OrçaCloud: Solicitação de Cotação #${request.number}*\n`;
        text += `Olá ${resp.supplierName}, tudo bem?\n\n`;
        text += `Gostaria de falar sobre os preços da cotação para a obra *${request.projectName}*.\n`;
        text += `Podemos alinhar os valores agora?\n\n`;
        text += `Acesse seu portal de fornecedor para visualizar nossas contrapropostas e enviar sua resposta final!`;

        const encoded = encodeURIComponent(text);
        window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    };

    const handleSendWebhook = () => {
        if (!request) return;

        askConfirm(
            "Deseja enviar/reenviar o detalhe desta cotação via automação (Make.com)? Isso pode disparar mensagens WhatsApp para os fornecedores.",
            () => {
                (async () => {
                    try {
                        setLoading(true);

                        let projectData = null;
                        if (request.projectId) {
                            projectData = await projectService.loadProject(request.projectId);
                        }

                        // Se a cotação não tem respostas ainda, 'responses' estaria vazio.
                        // Para notificar quem foi CONVIDADO, pegamos da lista de convidados:
                        let suppliersData: any[] = [];

                        if (request.invitedSupplierIds && request.invitedSupplierIds.length > 0) {
                            // Fetch the actual supplier details
                            const sups = await Promise.all(
                                request.invitedSupplierIds.map(id => supplierService.getById(id))
                            );

                            suppliersData = sups.filter((s): s is NonNullable<typeof s> => s !== null).map(s => ({
                                id: s.id,
                                name: s.name,
                                email: s.email,
                                phone: s.phone
                            }));
                        } else {
                            // Fallback (se por acaso for depender das respostas já dadas)
                            suppliersData = responses.map(r => ({
                                id: r.supplierId,
                                name: r.supplierName
                            }));
                        }

                        await webhookService.triggerQuotationSentWebhook(request, suppliersData, projectData);
                        notify("Cotação enviada via automação com sucesso!");
                    } catch (error: any) {
                        console.error("Erro ao enviar cotação via webhook:", error);
                        notify(`Erro na operação: ${error.message || 'Erro desconhecido'}`, "error");
                    } finally {
                        setLoading(false);
                    }
                })();
            }
        );
    };

    if (loading) return <div className="p-8 text-center animate-pulse font-bold text-gray-400">CARREGANDO MAPA COMPARATIVO...</div>;
    if (!request) return <div className="p-8 text-center text-red-500 font-bold">Cotação não encontrada.</div>;

    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    // Helper to get the effective item values (prioritizing counter-proposal)
    const getEffectiveItem = (resp: QuotationResponse, code: string) => {
        const original = resp.items.find(i => i.code === code);
        const counter = resp.counterProposal?.items.find(i => i.code === code);
        if (!original) return null;

        const unitPrice = counter?.unitPrice ?? original.unitPrice;
        return {
            ...original,
            unitPrice,
            total: unitPrice * original.quantity,
            isNegotiated: !!counter && counter.unitPrice !== original.unitPrice
        };
    };

    // Helper to find the lowest price for a specific item code
    const getLowestPriceForItem = (code: string) => {
        const prices = responses
            .map(r => getEffectiveItem(r, code)?.unitPrice)
            .filter((p): p is number => p !== undefined && p > 0);
        return prices.length > 0 ? Math.min(...prices) : 0;
    };

    return (
        <>
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Mapa de Cotação</h1>
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100">
                                {request.number}
                            </span>
                        </div>
                        <p className="text-gray-500 text-sm mt-1">{request.title} • {request.projectName}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSendWebhook}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 text-xs font-black uppercase tracking-widest disabled:opacity-50 active:scale-95"
                        title="Enviar para Automação (Make.com)"
                    >
                        <Zap className="w-4 h-4" />
                        Enviar Automação
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 min-w-[300px]">Item / Especificação</th>
                                {responses.map(resp => (
                                    <th key={resp.id} className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 border-l border-gray-100 text-center min-w-[200px]">
                                        <div className="flex flex-col items-center gap-1">
                                            <User className="w-4 h-4 text-blue-500" />
                                            <span className="text-gray-900">{resp.supplierName}</span>
                                            <div className="flex flex-wrap items-center justify-center gap-1 mt-1">
                                                {resp.negotiationStatus !== 'Original' && (
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${resp.negotiationStatus === 'Contraproposta' ? 'bg-orange-100 text-orange-600' :
                                                        resp.negotiationStatus === 'Nova Proposta' ? 'bg-indigo-100 text-indigo-600' :
                                                            resp.negotiationStatus === 'Aceita' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                                                        }`}>
                                                        {resp.negotiationStatus === 'Nova Proposta' ? 'Fornecedor Contrapropôs' : resp.negotiationStatus}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => handleStartNegotiation(resp, 'history')}
                                                    className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                                >
                                                    Histórico
                                                </button>
                                                <button
                                                    onClick={() => handleWhatsAppShare(resp.id)}
                                                    className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors flex items-center gap-1"
                                                    title="Chamar no WhatsApp"
                                                >
                                                    <MessageCircle className="w-2.5 h-2.5 fill-current" />
                                                    WhatsApp
                                                </button>
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {request.items.map(reqItem => (
                                <tr key={reqItem.code} className="hover:bg-gray-50/30 transition-colors">
                                    <td className="px-6 py-5">
                                        <p className="text-sm font-bold text-gray-900">{reqItem.description}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-mono font-bold text-gray-400">#{reqItem.code}</span>
                                            <span className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-1.5 py-0.5 rounded">{reqItem.quantity} {reqItem.unit}</span>
                                        </div>
                                    </td>
                                    {responses.map(resp => {
                                        const effective = getEffectiveItem(resp, reqItem.code);
                                        const isLowest = effective && effective.unitPrice === getLowestPriceForItem(reqItem.code);

                                        return (
                                            <td key={resp.id} className={`px-6 py-5 border-l border-gray-50 text-center ${isLowest ? 'bg-green-50/30' : ''}`}>
                                                {effective ? (
                                                    <div className="space-y-1">
                                                        <div className="flex flex-col items-center">
                                                            <p className={`text-sm font-black ${isLowest ? 'text-green-600' : (effective.isNegotiated ? 'text-orange-600' : 'text-gray-900')}`}>
                                                                {fmt(effective.unitPrice)}
                                                            </p>
                                                            {effective.isNegotiated && (
                                                                <span className="text-[8px] font-black text-orange-500 uppercase tracking-tighter">Negociado</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] font-bold text-gray-400">Total: {fmt(effective.total)}</p>
                                                        {isLowest && (
                                                            <div className="flex items-center justify-center gap-1 text-[9px] font-black text-green-500 uppercase tracking-widest">
                                                                <TrendingDown className="w-3 h-3" />
                                                                Melhor Preço
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest italic">Não cotado</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}

                            {/* Totals Row */}
                            <tr className="bg-gray-900 text-white">
                                <td className="px-6 py-6 text-right text-xs font-black uppercase tracking-widest opacity-60">Valor Total da Proposta</td>
                                {responses.map(resp => {
                                    const total = resp.items.reduce((acc, item) => acc + (getEffectiveItem(resp, item.code)?.total || 0), 0);
                                    const pm = resp.counterProposal?.paymentMethod || resp.paymentMethod || 'A combinar';
                                    const ptt = resp.counterProposal?.paymentTermType || resp.paymentTermType;
                                    const pd = resp.counterProposal?.paymentDays ?? resp.paymentDays;
                                    const pi = resp.counterProposal?.paymentInstallments ?? resp.paymentInstallments;

                                    return (
                                        <td key={resp.id} className="px-6 py-6 text-center border-l border-white/10">
                                            <div className="flex flex-col items-center">
                                                {resp.counterProposal && (
                                                    <span className="text-[10px] font-bold opacity-30 line-through mb-0.5">
                                                        {fmt(resp.items.reduce((acc, i) => acc + (i.total || 0), 0))}
                                                    </span>
                                                )}
                                                <p className={`text-lg font-black ${resp.counterProposal ? 'text-orange-400' : ''}`}>{fmt(total)}</p>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* Payment Method Info */}
                            <tr className="bg-gray-50/30">
                                <td className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Forma de Pagamento</td>
                                {responses.map(resp => {
                                    const original = resp.paymentMethod || 'Não informado';
                                    const negotiated = resp.counterProposal?.paymentMethod;
                                    const hasChanged = negotiated && negotiated !== resp.paymentMethod;

                                    return (
                                        <td key={resp.id} className="px-6 py-4 text-center border-l border-gray-100 border-b border-gray-100">
                                            <div className="flex flex-col items-center justify-center">
                                                {hasChanged && (
                                                    <span className="text-[9px] font-bold text-gray-400 line-through mb-0.5">{original}</span>
                                                )}
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                                                    <CreditCard className={`w-3.5 h-3.5 ${hasChanged ? 'text-orange-500' : 'text-blue-500'}`} />
                                                    <span className={hasChanged ? 'text-orange-600' : ''}>{negotiated || original}</span>
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* Payment Terms Info */}
                            <tr className="bg-gray-50/30">
                                <td className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">Condições de Pagamento</td>
                                {responses.map(resp => {
                                    const renderTerm = (type: string, days?: number, inst?: number) => {
                                        if (type === 'Vista') return `${days || 0} Dias`;
                                        return `${inst || 1}x Sem Juros`;
                                    };

                                    const original = renderTerm(resp.paymentTermType || 'Vista', resp.paymentDays, resp.paymentInstallments);
                                    const cp = resp.counterProposal;
                                    const negotiated = cp ? renderTerm(cp.paymentTermType || 'Vista', cp.paymentDays, cp.paymentInstallments) : null;
                                    const hasChanged = negotiated && negotiated !== original;

                                    return (
                                        <td key={resp.id} className="px-6 py-4 text-center border-l border-gray-100 border-b border-gray-100">
                                            <div className="flex flex-col items-center justify-center">
                                                {hasChanged && (
                                                    <span className="text-[9px] font-bold text-gray-400 line-through mb-0.5">{original}</span>
                                                )}
                                                <div className="text-xs font-bold text-gray-900 uppercase tracking-tighter">
                                                    <span className={hasChanged ? 'text-orange-600' : ''}>{negotiated || original}</span>
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* Delivery Info */}
                            <tr className="bg-gray-50/50">
                                <td className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Entrega Estimada</td>
                                {responses.map(resp => {
                                    const originalDate = resp.deliveryDate ? new Date(resp.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Não informado';
                                    const cp = resp.counterProposal;
                                    const negotiatedDate = cp?.deliveryDate ? new Date(cp.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : null;
                                    const dateChanged = negotiatedDate && negotiatedDate !== originalDate;

                                    const originalMethod = resp.deliveryMethod || 'A combinar';
                                    const negotiatedMethod = cp?.deliveryMethod;
                                    const methodChanged = negotiatedMethod && negotiatedMethod !== resp.deliveryMethod;

                                    return (
                                        <td key={resp.id} className="px-6 py-4 text-center border-l border-gray-100">
                                            <div className="flex flex-col items-center justify-center gap-1">
                                                <div className="flex flex-col items-center">
                                                    {dateChanged && (
                                                        <span className="text-[9px] font-bold text-gray-400 line-through">{originalDate}</span>
                                                    )}
                                                    <div className="flex items-center gap-2 text-xs font-bold text-gray-900">
                                                        <Calendar className={`w-3.5 h-3.5 ${dateChanged ? 'text-orange-500' : 'text-blue-500'}`} />
                                                        <span className={dateChanged ? 'text-orange-600' : ''}>{negotiatedDate || originalDate}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    {methodChanged && (
                                                        <span className="text-[8px] font-bold text-gray-400 line-through">{originalMethod}</span>
                                                    )}
                                                    <p className={`text-[9px] font-bold uppercase tracking-widest ${methodChanged ? 'text-orange-500' : 'text-gray-400'}`}>
                                                        {negotiatedMethod || originalMethod}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>

                            {/* Action Buttons */}
                            <tr className="bg-white">
                                <td className="px-6 py-6"></td>
                                {responses.map(resp => (
                                    <td key={resp.id} className="px-6 py-6 text-center border-l border-gray-100">
                                        <div className="space-y-2">
                                            {resp.negotiationStatus === 'Nova Proposta' ? (
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => handleNegotiationAction(resp.id, true)}
                                                        disabled={processing}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 shadow-md transition-all active:scale-95"
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Aceitar Proposta
                                                    </button>
                                                    <button
                                                        onClick={() => handleNegotiationAction(resp.id, false)}
                                                        disabled={processing}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-red-600 border border-red-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all active:scale-95"
                                                    >
                                                        <XCircle className="w-4 h-4" />
                                                        Recusar
                                                    </button>
                                                    <button
                                                        onClick={() => handleStartNegotiation(resp)}
                                                        disabled={processing || negotiatingId !== null}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all active:scale-95"
                                                    >
                                                        <MessageSquare className="w-4 h-4" />
                                                        Contrapropor
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => handleSelectWinner(resp.id)}
                                                        disabled={processing || resp.status === 'Selecionada' || negotiatingId !== null}
                                                        className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 ${resp.status === 'Selecionada'
                                                            ? 'bg-green-600 text-white cursor-default shadow-green-900/10'
                                                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-900/10'
                                                            }`}
                                                    >
                                                        {resp.status === 'Selecionada' ? (
                                                            <>
                                                                <CheckCircle2 className="w-4 h-4" />
                                                                Selecionado
                                                            </>
                                                        ) : (
                                                            <>
                                                                <DollarSign className="w-4 h-4" />
                                                                Fechar Compra
                                                            </>
                                                        )}
                                                    </button>

                                                    {resp.status !== 'Selecionada' && (
                                                        <button
                                                            onClick={() => handleStartNegotiation(resp)}
                                                            disabled={processing || negotiatingId !== null}
                                                            className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <TrendingDown className="w-4 h-4" />
                                                            Contraproposta
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {responses.length === 0 && (
                <div className="bg-white p-20 rounded-[2.5rem] border border-gray-100 shadow-sm text-center">
                    <Info className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Aguardando Propostas</h2>
                    <p className="text-gray-400 text-sm font-medium max-w-sm mx-auto">
                        Assim que os fornecedores responderem, as propostas aparecerão aqui para comparação.
                    </p>
                </div>
            )}

            {/* Negotiation Modal */}
            {negotiatingId && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full mx-auto max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/30">
                            <div>
                                <h3 className="text-lg font-black text-indigo-900 uppercase tracking-tight">Fazer Contraproposta</h3>
                                <p className="text-sm text-indigo-600 font-medium">Negociando com {responses.find(r => r.id === negotiatingId)?.supplierName}</p>
                            </div>
                            <button
                                onClick={() => setNegotiatingId(null)}
                                className="p-2 hover:bg-white rounded-full transition-all"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex bg-indigo-50/20 px-8 border-b border-gray-100">
                            <button
                                onClick={() => setNegotiationTab('form')}
                                className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${negotiationTab === 'form' ? 'border-indigo-600 text-indigo-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                            >
                                Nova Proposta
                            </button>
                            <button
                                onClick={() => setNegotiationTab('history')}
                                className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${negotiationTab === 'history' ? 'border-indigo-600 text-indigo-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                            >
                                Histórico ({responses.find(r => r.id === negotiatingId)?.negotiationHistory?.length || 0})
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1">
                            {negotiationTab === 'form' ? (
                                <div className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">Logística de Entrega</h4>
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Data de Entrega</label>
                                                <input
                                                    type="date"
                                                    value={counterFormData.deliveryDate}
                                                    onChange={(e) => setCounterFormData(prev => ({ ...prev, deliveryDate: e.target.value }))}
                                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Método de Entrega</label>
                                                <select
                                                    value={counterFormData.deliveryMethod}
                                                    onChange={(e) => setCounterFormData(prev => ({ ...prev, deliveryMethod: e.target.value }))}
                                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                                                >
                                                    <option value="FOB - Retirada por conta do comprador">FOB - Retirada por conta do comprador</option>
                                                    <option value="CIF - Entrega por conta do fornecedor">CIF - Entrega por conta do fornecedor</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Local de Entrega</label>
                                                <input
                                                    type="text"
                                                    value={counterFormData.deliveryLocation}
                                                    onChange={(e) => setCounterFormData(prev => ({ ...prev, deliveryLocation: e.target.value }))}
                                                    placeholder="Ex: Canteiro de Obras"
                                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-4">Condições Financeiras</h4>
                                            <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Forma de Pagamento</label>
                                                <select
                                                    value={counterFormData.paymentMethod}
                                                    onChange={(e) => setCounterFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                                                >
                                                    <option value="Boleto">Boleto Bancário</option>
                                                    <option value="Pix">Pix</option>
                                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                                    <option value="Transferência">Transferência Bancária</option>
                                                    <option value="Dinheiro">Dinheiro</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">Condição</label>
                                                    <select
                                                        value={counterFormData.paymentTermType}
                                                        onChange={(e) => setCounterFormData(prev => ({ ...prev, paymentTermType: e.target.value as 'Vista' | 'Parcelado' }))}
                                                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                                                    >
                                                        <option value="Vista">À Vista</option>
                                                        <option value="Parcelado">Parcelado</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                                                        {counterFormData.paymentTermType === 'Vista' ? 'Prazo (Dias)' : 'Parcelas (X)'}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={counterFormData.paymentTermType === 'Vista' ? counterFormData.paymentDays : counterFormData.paymentInstallments}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 1;
                                                            if (counterFormData.paymentTermType === 'Vista') {
                                                                setCounterFormData(prev => ({ ...prev, paymentDays: val }));
                                                            } else {
                                                                setCounterFormData(prev => ({ ...prev, paymentInstallments: val }));
                                                            }
                                                        }}
                                                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-100/50">
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Item</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Qtd</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Preço Atual</th>
                                                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Novo Preço</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {responses.find(r => r.id === negotiatingId)?.items.map((item, idx) => (
                                                    <tr key={item.code} className="hover:bg-white transition-all">
                                                        <td className="px-6 py-4">
                                                            <div className="text-sm font-bold text-gray-900">{item.description}</div>
                                                            <div className="text-[10px] font-medium text-gray-400 uppercase">{item.code}</div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-bold text-gray-600">{item.quantity} {item.unit}</td>
                                                        <td className="px-6 py-4 text-right font-black text-gray-400 line-through">
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end">
                                                                <span className="text-gray-400 mr-1 text-xs font-black">R$</span>
                                                                <input
                                                                    type="number"
                                                                    value={counterFormData.items[idx]?.unitPrice}
                                                                    onChange={(e) => {
                                                                        const newItems = [...counterFormData.items];
                                                                        newItems[idx] = { ...newItems[idx], unitPrice: parseFloat(e.target.value) || 0 };
                                                                        setCounterFormData(prev => ({ ...prev, items: newItems }));
                                                                    }}
                                                                    className="w-24 px-3 py-2 bg-white border border-indigo-200 rounded-xl text-sm font-black text-indigo-600 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-right"
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {responses.find(r => r.id === negotiatingId)?.negotiationHistory?.length ? (
                                        responses.find(r => r.id === negotiatingId)?.negotiationHistory?.map((event, idx) => (
                                            <div key={idx} className="relative pl-8 pb-6 border-l-2 border-indigo-100 last:border-0 last:pb-0">
                                                <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full border-2 border-white ${event.author === 'Comprador' ? 'bg-indigo-600' : 'bg-orange-500'}`} />
                                                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 shadow-sm">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight ${event.author === 'Comprador' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {event.author === 'Comprador' ? 'Sua Sugestão' : 'Fornecedor'}
                                                            </span>
                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{event.action}</span>
                                                        </div>
                                                        <time className="text-[10px] font-medium text-gray-400">{new Date(event.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                                                    </div>

                                                    {event.changes.items && event.changes.items.length > 0 && (
                                                        <div className="space-y-2 mb-4">
                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Alterações de Preço:</p>
                                                            <div className="grid grid-cols-1 gap-2">
                                                                {event.changes.items.map(change => (
                                                                    <div key={change.code} className="flex items-center justify-between text-xs py-2 px-3 bg-white rounded-lg border border-gray-100">
                                                                        <span className="font-bold text-gray-600">{change.code}</span>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-gray-400 line-through">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(change.oldPrice)}</span>
                                                                            <span className="font-black text-indigo-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(change.newPrice)}</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-4">
                                                        {event.changes.deliveryDate && (
                                                            <div className="text-[10px] space-y-1">
                                                                <span className="font-black text-gray-400 uppercase tracking-widest block">Entrega:</span>
                                                                <span className="font-bold text-gray-900">{event.changes.deliveryDate.new}</span>
                                                            </div>
                                                        )}
                                                        {event.changes.paymentMethod && (
                                                            <div className="text-[10px] space-y-1">
                                                                <span className="font-black text-gray-400 uppercase tracking-widest block">Pagamento:</span>
                                                                <span className="font-bold text-gray-900">{event.changes.paymentMethod.new}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {event.notes && (
                                                        <div className="mt-4 pt-4 border-t border-gray-100 italic text-sm text-gray-500">
                                                            "{event.notes}"
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-12">
                                            <Info className="w-8 h-8 text-gray-200 mx-auto mb-3" />
                                            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Sem histórico disponível</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="px-8 py-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-4 text-gray-400 text-xs font-bold uppercase tracking-widest">
                                <AlertTriangle className="w-4 h-4 text-orange-500" />
                                O fornecedor será notificado para aceitar ou recusar estes valores.
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setNegotiatingId(null)}
                                    className="px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSendCounterProposal}
                                    disabled={processing}
                                    className="px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-900/10 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    {processing ? 'ENVIANDO...' : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Enviar Contraproposta
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Notification toast */}
        {notification && (
            <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                {notification.message}
            </div>
        )}

        {/* Inline confirm modal */}
        {pendingConfirm && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
                <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-gray-100 animate-in zoom-in-95 duration-200">
                    <p className="text-sm font-medium text-gray-700 mb-6 leading-relaxed">{pendingConfirm.message}</p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setPendingConfirm(null)}
                            className="px-6 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
                            className="px-6 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default SupplyChainQuotationComparison;
