import React from 'react';
import { ArrowLeft, Send, DollarSign, Calendar, Clock, HandCoins, AlertCircle, CheckCircle2, TrendingDown, XCircle } from 'lucide-react';
import { QuotationRequest, QuotationResponse, QuotationRequestItem } from '../types';
import { quotationService } from '../services/quotationService';

interface QuotationResponseFormProps {
    request: QuotationRequest;
    supplierId: string;
    onBack: () => void;
    onSave: () => void;
}

const QuotationResponseForm: React.FC<QuotationResponseFormProps> = ({ request, supplierId, onBack, onSave }) => {
    const [loading, setLoading] = React.useState(false);
    const [existingResponse, setExistingResponse] = React.useState<QuotationResponse | null>(null);
    const [formData, setFormData] = React.useState<Omit<QuotationResponse, 'id' | 'created_at'>>({
        requestId: request.id,
        supplierId: supplierId,
        items: request.items.map(item => ({
            code: item.code,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: 0,
            total: 0,
            notes: ''
        })),
        deliveryDate: request.deliveryDate || '',
        deliveryMethod: request.deliveryMethod || 'CIF - Entrega por conta do fornecedor',
        deliveryLocation: request.deliveryLocation || 'Canteiro de Obras',
        paymentMethod: request.paymentMethod || 'Boleto',
        paymentTermType: request.paymentTermType || 'Vista',
        paymentDays: request.paymentDays || 30,
        paymentInstallments: request.paymentInstallments || 1,
        status: 'Pendente',
        notes: ''
    });

    React.useEffect(() => {
        const fetchExisting = async () => {
            try {
                const resps = await quotationService.listResponses(request.id);
                const mine = resps.find(r => r.supplierId === supplierId);
                if (mine) {
                    setExistingResponse(mine);

                    // If there's a counter-proposal from the buyer, pre-fill the form with those suggested values
                    const isNegotiating = mine.negotiationStatus === 'Contraproposta';
                    const cp = mine.counterProposal;

                    setFormData({
                        requestId: mine.requestId,
                        supplierId: mine.supplierId,
                        items: mine.items.map(item => {
                            if (isNegotiating && cp?.items) {
                                const suggestedItem = cp.items.find(ci => ci.code === item.code);
                                if (suggestedItem) {
                                    return {
                                        ...item,
                                        unitPrice: suggestedItem.unitPrice,
                                        total: suggestedItem.unitPrice * item.quantity
                                    };
                                }
                            }
                            return item;
                        }),
                        deliveryDate: (isNegotiating ? cp?.deliveryDate : mine.deliveryDate) || mine.deliveryDate || '',
                        deliveryMethod: (isNegotiating ? cp?.deliveryMethod : mine.deliveryMethod) || mine.deliveryMethod || '',
                        deliveryLocation: (isNegotiating ? cp?.deliveryLocation : mine.deliveryLocation) || mine.deliveryLocation || '',
                        paymentMethod: (isNegotiating ? cp?.paymentMethod : mine.paymentMethod) || mine.paymentMethod || '',
                        paymentTermType: (isNegotiating ? cp?.paymentTermType : mine.paymentTermType) || mine.paymentTermType || 'Vista',
                        paymentDays: (isNegotiating ? cp?.paymentDays : mine.paymentDays) ?? mine.paymentDays ?? 30,
                        paymentInstallments: (isNegotiating ? cp?.paymentInstallments : mine.paymentInstallments) ?? mine.paymentInstallments ?? 1,
                        status: mine.status,
                        notes: mine.notes || ''
                    });
                }
            } catch (err) {
                console.error("Error fetching existing response:", err);
            }
        };
        fetchExisting();
    }, [request.id, supplierId]);

    const handleUpdatePrice = (index: number, price: number) => {
        setFormData(prev => {
            const newItems = [...prev.items];
            newItems[index] = {
                ...newItems[index],
                unitPrice: price,
                total: price * newItems[index].quantity
            };
            return { ...prev, items: newItems };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await quotationService.submitResponse(formData);
            onSave();
        } catch (err) {
            console.error("Error submitting response:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleNegotiationResponse = async (accept: boolean) => {
        if (!existingResponse) return;
        const msg = accept ? "Deseja aceitar os valores da contraproposta?" : "Deseja recusar a contraproposta e manter seus valores originais?";
        if (!confirm(msg)) return;

        setLoading(true);
        try {
            await quotationService.respondToCounterProposal(existingResponse.id, accept);
            alert(accept ? "Contraproposta aceita!" : "Contraproposta recusada.");
            onSave();
        } catch (err) {
            console.error("Error responding to counter proposal:", err);
            alert("Erro ao processar resposta.");
        } finally {
            setLoading(false);
        }
    };

    const handleSendSupplierCounter = async () => {
        if (!existingResponse) return;
        if (!confirm("Deseja enviar uma nova contraproposta com estes valores?")) return;

        setLoading(true);
        try {
            await quotationService.sendCounterProposal(existingResponse.id, {
                items: formData.items,
                deliveryDate: formData.deliveryDate,
                deliveryMethod: formData.deliveryMethod,
                paymentMethod: formData.paymentMethod,
                paymentTermType: formData.paymentTermType,
                paymentDays: formData.paymentDays,
                paymentInstallments: formData.paymentInstallments,
                notes: formData.notes
            }, 'Fornecedor');

            alert("Sua contraproposta foi enviada com sucesso!");
            onSave();
        } catch (err: any) {
            console.error("Error sending supplier counter:", err);
            alert(`Erro ao enviar contraproposta: ${err.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    const totalProprosal = formData.items.reduce((sum, item) => sum + item.total, 0);

    return (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-12 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="relative bg-white rounded-[3rem] shadow-2xl w-full h-full flex flex-col animate-in zoom-in-95 duration-300 overflow-hidden border border-white/20">

                {/* Cabeçalho Executivo Premium */}
                <div className="px-12 py-10 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={onBack}
                            className="p-4 bg-white text-gray-400 hover:text-indigo-600 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div className="flex flex-col">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Enviar <span className="text-indigo-600">Proposta</span></h1>
                            <p className="text-gray-400 text-[11px] font-black uppercase tracking-[0.3em] mt-1.5 flex items-center gap-2">
                                <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
                                Cotação #{request.number} • {request.title}
                            </p>
                        </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-3">
                        {existingResponse?.negotiationStatus === 'Contraproposta' ? (
                            <button
                                type="button"
                                onClick={handleSendSupplierCounter}
                                disabled={loading}
                                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-900/20 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3"
                            >
                                <TrendingDown className="w-4 h-4" />
                                Enviar Contraproposta ao Comprador
                            </button>
                        ) : (
                            <button
                                type="submit"
                                form="quotation-form"
                                disabled={loading}
                                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-900/20 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-3"
                            >
                                <Send className="w-4 h-4" />
                                {existingResponse ? 'Atualizar Proposta' : 'Enviar Proposta Agora'}
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                    <div className="max-w-5xl mx-auto space-y-8 pb-12">

                        {existingResponse?.negotiationStatus === 'Contraproposta' && (
                            <div className="mb-8 bg-orange-50 border-2 border-orange-200 p-8 rounded-[2.5rem] shadow-sm animate-in zoom-in-95 duration-300">
                                <div className="flex items-start gap-6">
                                    <div className="p-4 bg-orange-100 rounded-3xl">
                                        <TrendingDown className="w-8 h-8 text-orange-600" />
                                    </div>
                                    <div className="flex-1">
                                        <h2 className="text-xl font-black text-orange-950 uppercase tracking-tight">Nova Contraproposta Recebida</h2>
                                        <p className="text-orange-800 font-medium mt-1">O comprador revisou sua proposta e sugeriu novos valores ou condições. Você pode aceitar estes termos, manter sua proposta original ou ajustar os valores abaixo e enviar uma nova contraproposta.</p>

                                        <div className="mt-6 flex flex-wrap gap-4">
                                            <button
                                                onClick={() => handleNegotiationResponse(true)}
                                                disabled={loading}
                                                type="button"
                                                className="px-8 py-4 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-700 shadow-lg shadow-orange-900/10 active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                Aceitar Contraproposta
                                            </button>
                                            <button
                                                onClick={() => handleNegotiationResponse(false)}
                                                disabled={loading}
                                                type="button"
                                                className="px-8 py-4 bg-white text-orange-600 border border-orange-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-100 active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <XCircle className="w-4 h-4" />
                                                Recusar e Manter Original
                                            </button>
                                            <button
                                                onClick={handleSendSupplierCounter}
                                                disabled={loading}
                                                type="button"
                                                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-900/10 active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <Send className="w-4 h-4" />
                                                Enviar Contraproposta
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {existingResponse?.negotiationHistory && existingResponse.negotiationHistory.length > 0 && (
                            <div className="mb-8 space-y-4">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 ml-4">
                                    <Clock className="w-4 h-4 text-indigo-500" />
                                    Histórico da Negociação
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {existingResponse.negotiationHistory.map((event, idx) => (
                                        <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-tight ${event.author === 'Fornecedor' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {event.author}
                                                </span>
                                                <span className="text-[10px] font-medium text-gray-400">{new Date(event.timestamp).toLocaleDateString('pt-BR')}</span>
                                            </div>
                                            <div className="text-xs font-black text-gray-900 uppercase tracking-tight mb-2">{event.action}</div>

                                            {event.changes.items && event.changes.items.length > 0 && (
                                                <div className="text-[9px] font-bold text-indigo-600 mb-2">
                                                    {event.changes.items.length} itens com ajuste de preço
                                                </div>
                                            )}

                                            {event.notes && (
                                                <p className="text-[10px] text-gray-500 italic line-clamp-2">"{event.notes}"</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <form id="quotation-form" onSubmit={handleSubmit} className="space-y-8">
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50/50">
                                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Descrição</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Qtd</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Unitário (R$)</th>
                                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {formData.items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-8 py-5">
                                                    <p className="text-sm font-bold text-gray-900">{item.description}</p>
                                                    <p className="text-[10px] font-mono text-gray-400">#{item.code}</p>
                                                </td>
                                                <td className="px-8 py-5 text-right font-black text-indigo-600">{item.quantity} {item.unit}</td>
                                                <td className="px-8 py-5 text-right">
                                                    <div className="space-y-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            required
                                                            value={item.unitPrice}
                                                            onChange={e => handleUpdatePrice(idx, parseFloat(e.target.value) || 0)}
                                                            className={`w-32 bg-gray-50 border rounded-xl px-4 py-2 text-right text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/10 ${existingResponse?.counterProposal?.items.find(ci => ci.code === item.code)?.unitPrice !== undefined &&
                                                                existingResponse?.counterProposal?.items.find(ci => ci.code === item.code)?.unitPrice !== item.unitPrice
                                                                ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                                : 'border-gray-100'
                                                                }`}
                                                        />
                                                        {existingResponse?.counterProposal?.items.find(ci => ci.code === item.code) && (
                                                            <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight">Sugerido: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(existingResponse.counterProposal.items.find(ci => ci.code === item.code)!.unitPrice)}</div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-right font-bold text-gray-900">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-900 text-white">
                                        <tr>
                                            <td colSpan={3} className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest opacity-60">Total da sua Proposta</td>
                                            <td className="px-8 py-6 text-right font-black text-xl">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalProprosal)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-indigo-500" />
                                        Condições de Entrega
                                    </h3>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Previsão de Entrega</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.deliveryDate}
                                            onChange={e => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))}
                                            className={`w-full bg-gray-50 border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-50/10 ${existingResponse?.counterProposal?.deliveryDate && existingResponse.counterProposal.deliveryDate !== existingResponse.deliveryDate
                                                ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                : 'border-gray-100'
                                                }`}
                                        />
                                        {existingResponse?.counterProposal?.deliveryDate && existingResponse.counterProposal.deliveryDate !== existingResponse.deliveryDate && (
                                            <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1">Sugerido: {new Date(existingResponse.counterProposal.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Forma de Entrega</label>
                                        <div className="relative">
                                            <select
                                                value={formData.deliveryMethod}
                                                onChange={e => setFormData(prev => ({ ...prev, deliveryMethod: e.target.value }))}
                                                className={`w-full bg-gray-50 border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-50/10 appearance-none cursor-pointer ${existingResponse?.counterProposal?.deliveryMethod && existingResponse.counterProposal.deliveryMethod !== existingResponse.deliveryMethod
                                                    ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                    : 'border-gray-100'
                                                    }`}
                                            >
                                                <option value="CIF - Entrega por conta do fornecedor">CIF - Entrega por conta do fornecedor</option>
                                                <option value="FOB - Retirada por conta do comprador">FOB - Retirada por conta do comprador</option>
                                                <option value="Entrega Própria Fornecedor">Entrega Própria Fornecedor</option>
                                                <option value="Transportadora Terceirizada">Transportadora Terceirizada</option>
                                                <option value="Retirada em Mãos">Retirada em Mãos</option>
                                            </select>
                                            {existingResponse?.counterProposal?.deliveryMethod && existingResponse.counterProposal.deliveryMethod !== existingResponse.deliveryMethod && (
                                                <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1 mt-1">Sugerido: {existingResponse.counterProposal.deliveryMethod}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Local de Entrega</label>
                                        <input
                                            type="text"
                                            value={formData.deliveryLocation}
                                            onChange={e => setFormData(prev => ({ ...prev, deliveryLocation: e.target.value }))}
                                            placeholder="Canteiro de Obras"
                                            className={`w-full bg-gray-50 border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-50/10 ${existingResponse?.counterProposal?.deliveryLocation && existingResponse.counterProposal.deliveryLocation !== existingResponse.deliveryLocation
                                                ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                : 'border-gray-100'
                                                }`}
                                        />
                                        {existingResponse?.counterProposal?.deliveryLocation && existingResponse.counterProposal.deliveryLocation !== existingResponse.deliveryLocation && (
                                            <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1">Sugerido: {existingResponse.counterProposal.deliveryLocation}</div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <HandCoins className="w-4 h-4 text-indigo-500" />
                                        Condições de Pagamento
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Método</label>
                                            <select
                                                value={formData.paymentMethod}
                                                onChange={e => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                                                className={`w-full bg-gray-50 border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 appearance-none cursor-pointer ${existingResponse?.counterProposal?.paymentMethod && existingResponse.counterProposal.paymentMethod !== existingResponse.paymentMethod
                                                    ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                    : 'border-gray-100'
                                                    }`}
                                            >
                                                <option value="Boleto">Boleto Bancário</option>
                                                <option value="Pix">Pix</option>
                                                <option value="Cartão de Crédito">Cartão de Crédito</option>
                                                <option value="Cartão de Débito">Cartão de Débito</option>
                                                <option value="Transferência">Transferência Bancária</option>
                                                <option value="Dinheiro">Dinheiro</option>
                                            </select>
                                            {existingResponse?.counterProposal?.paymentMethod && existingResponse.counterProposal.paymentMethod !== existingResponse.paymentMethod && (
                                                <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1">Sugerido: {existingResponse.counterProposal.paymentMethod}</div>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Prazo/Parcelas</label>
                                            <div className={`flex rounded-xl p-1 border h-[52px] ${existingResponse?.counterProposal?.paymentTermType && existingResponse.counterProposal.paymentTermType !== existingResponse.paymentTermType
                                                ? 'bg-orange-100 border-orange-300 ring-2 ring-orange-100'
                                                : 'bg-gray-100 border-gray-200'
                                                }`}>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, paymentTermType: 'Vista' }))}
                                                    className={`flex-1 py-1 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${formData.paymentTermType === 'Vista' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    À Vista
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, paymentTermType: 'Parcelado' }))}
                                                    className={`flex-1 py-1 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${formData.paymentTermType === 'Parcelado' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    Parcelado
                                                </button>
                                            </div>
                                            {existingResponse?.counterProposal?.paymentTermType && existingResponse.counterProposal.paymentTermType !== existingResponse.paymentTermType && (
                                                <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1">Sugerido: {existingResponse.counterProposal.paymentTermType}</div>
                                            )}
                                        </div>
                                    </div>

                                    {formData.paymentTermType === 'Vista' ? (
                                        <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Dias para Pagamento</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={formData.paymentDays}
                                                    onChange={e => setFormData(prev => ({ ...prev, paymentDays: parseInt(e.target.value) || 0 }))}
                                                    className={`w-full bg-gray-50 border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 pr-12 ${existingResponse?.counterProposal?.paymentDays !== undefined && existingResponse.counterProposal.paymentDays !== existingResponse.paymentDays
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                        : 'border-gray-100'
                                                        }`}
                                                />
                                                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">Dias</div>
                                            </div>
                                            {existingResponse?.counterProposal?.paymentDays !== undefined && existingResponse.counterProposal.paymentDays !== existingResponse.paymentDays && (
                                                <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1">Sugerido: {existingResponse.counterProposal.paymentDays} dias</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Número de Parcelas</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={formData.paymentInstallments}
                                                    onChange={e => setFormData(prev => ({ ...prev, paymentInstallments: parseInt(e.target.value) || 1 }))}
                                                    className={`w-full bg-gray-50 border rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 pr-12 ${existingResponse?.counterProposal?.paymentInstallments !== undefined && existingResponse.counterProposal.paymentInstallments !== existingResponse.paymentInstallments
                                                        ? 'border-orange-300 bg-orange-50 text-orange-700 ring-2 ring-orange-100'
                                                        : 'border-gray-100'
                                                        }`}
                                                />
                                                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-400 uppercase">X</div>
                                            </div>
                                            {existingResponse?.counterProposal?.paymentInstallments !== undefined && existingResponse.counterProposal.paymentInstallments !== existingResponse.paymentInstallments && (
                                                <div className="text-[9px] font-black text-orange-500 uppercase tracking-tight ml-1">Sugerido: {existingResponse.counterProposal.paymentInstallments} parcelas</div>
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                            Observações Adicionais
                                        </label>
                                        <textarea
                                            value={formData.notes || ''}
                                            onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                            placeholder="Validade da proposta, marcas, etc..."
                                            className="w-full h-24 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500/10 resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuotationResponseForm;
