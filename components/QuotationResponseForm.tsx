import React from 'react';
import {
    ArrowLeft, Send, Calendar, Clock, HandCoins, CheckCircle2, TrendingDown, XCircle,
    FileText, Package, Building2,
} from 'lucide-react';
import { QuotationRequest, QuotationResponse } from '../types';
import { quotationService } from '../services/quotationService';
import { supplierPortalTokenService } from '../services/supplierPortalTokenService';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import SaveStatus from './ui/SaveStatus';

interface QuotationResponseFormProps {
    request: QuotationRequest;
    supplierId: string;
    onBack: () => void;
    onSave: () => void;
    /** Acesso via link público (sem login) — mesmo padrão do Portal do Parceiro. */
    portalToken?: string;
    /**
     * Cor de acento. `indigo` é o padrão do app; `portal` é o coral do
     * vocabulário dos portais externos (§24), usado na visão do fornecedor —
     * mesma prop de `SupplyChainOrderDetails`, para a tela de responder cotação
     * ler igual à tela de detalhe do pedido dentro do portal.
     * Cores SEMÂNTICAS (âmbar de contraproposta, emerald de aceite, vermelho de
     * recusa) NÃO entram aqui — valem igual nos dois contextos.
     */
    accent?: 'indigo' | 'portal';
}

// Cada variante escrita por extenso — o JIT do Tailwind não enxerga classe
// montada em runtime (§24). Mesmo mapa de `SupplyChainOrderDetails.tsx`.
const ACCENTS = {
    indigo: {
        text: 'text-indigo-600',
        icon: 'text-indigo-500',
        panel: 'bg-indigo-50/50 border-indigo-100/50',
        primaryBtn: 'bg-blue-600 text-white hover:bg-blue-700',
        softBtn: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
        ring: 'focus:ring-indigo-500/20 focus:border-indigo-500',
        toggleOn: 'bg-indigo-600 text-white shadow-sm',
        backHover: 'hover:text-indigo-600 hover:border-indigo-200',
    },
    portal: {
        text: 'text-[#C24428]',
        icon: 'text-[#E1553C]',
        panel: 'bg-[#FDF8F6] border-[#F3D9D1]',
        primaryBtn: 'bg-[#E1553C] text-white hover:bg-[#C8452E]',
        softBtn: 'bg-[#FDEDE8] text-[#C24428] hover:bg-[#FBE0D8]',
        ring: 'focus:ring-[#E1553C]/20 focus:border-[#E1553C]',
        toggleOn: 'bg-[#E1553C] text-white shadow-sm',
        backHover: 'hover:text-[#C24428] hover:border-[#F3D9D1]',
    },
} as const;

const formatBRL = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

/** Aceita data pura (YYYY-MM-DD) ou timestamp — a âncora de meio-dia evita o pulo de fuso. */
const parseDate = (value?: string | null): Date | null => {
    if (!value) return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (value?: string | null) => {
    const d = parseDate(value);
    return d ? d.toLocaleDateString('pt-BR') : '—';
};

// §8 — texto colorido simples, sem pílula/fundo/uppercase.
const STATUS_STYLES: Record<string, string> = {
    'Aberta': 'text-blue-600',
    'Em Análise': 'text-amber-600',
    'Concluída': 'text-emerald-600',
    'Cancelada': 'text-gray-400',
};

const TABS = [
    { id: 'itens', label: 'Itens e preços', icon: Package },
    { id: 'condicoes', label: 'Condições', icon: FileText },
    { id: 'negociacao', label: 'Negociação', icon: TrendingDown },
] as const;
type TabId = typeof TABS[number]['id'];

const QuotationResponseForm: React.FC<QuotationResponseFormProps> = ({
    request, supplierId, onBack, onSave, portalToken, accent = 'indigo',
}) => {
    const A = ACCENTS[accent];
    const confirm = useConfirm();
    const { showToast } = useToast();
    // §25 — atualizar proposta existente não fecha a tela; sair com pendência pergunta.
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();
    const [savedAt, setSavedAt] = React.useState<number | null>(null);

    const [loading, setLoading] = React.useState(false);
    const [aba, setAba] = React.useState<TabId>('itens');
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
                const mine = portalToken
                    ? await supplierPortalTokenService.getQuotationResponse(portalToken, request.id)
                    : (await quotationService.listResponses(request.id)).find(r => r.supplierId === supplierId);
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
                    // Pré-preenchimento não é edição do usuário — não marca pendência.
                    markSaved();
                }
            } catch (err) {
                console.error("Error fetching existing response:", err);
            }
        };
        fetchExisting();
    }, [request.id, supplierId, portalToken, markSaved]);

    const emNegociacao = existingResponse?.negotiationStatus === 'Contraproposta';
    const temHistorico = (existingResponse?.negotiationHistory?.length ?? 0) > 0;
    const abasVisiveis = TABS.filter(t => t.id !== 'negociacao' || emNegociacao || temHistorico);

    // A aba Negociação só existe enquanto houver contraproposta/histórico — se ela
    // sumir com o usuário parado nela, a tela ficaria em branco.
    React.useEffect(() => {
        if (aba === 'negociacao' && !emNegociacao && !temHistorico) setAba('itens');
    }, [aba, emNegociacao, temHistorico]);

    const setCampo = <K extends keyof typeof formData>(key: K, value: typeof formData[K]) => {
        setFormData(prev => ({ ...prev, [key]: value }));
        markDirty();
    };

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
        markDirty();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (portalToken) {
                await supplierPortalTokenService.submitQuotationResponse(portalToken, request.id, formData);
            } else {
                await quotationService.submitResponse(formData);
            }
            markSaved();
            setSavedAt(Date.now());
            // §25 — criar fecha (a tarefa acabou); atualizar permanece na tela.
            if (existingResponse) {
                showToast('Proposta atualizada.');
            } else {
                showToast('Proposta enviada.');
                onSave();
            }
        } catch (err) {
            console.error("Error submitting response:", err);
            showToast(`Erro ao enviar proposta: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleNegotiationResponse = async (accept: boolean) => {
        if (!existingResponse) return;
        const ok = await confirm({
            title: accept ? 'Aceitar a contraproposta?' : 'Recusar a contraproposta?',
            message: accept
                ? 'Os valores e condições sugeridos pelo comprador passam a valer para a sua proposta.'
                : 'Sua proposta original é mantida e o comprador é avisado da recusa.',
            variant: accept ? 'default' : 'warning',
            confirmLabel: accept ? 'Aceitar' : 'Recusar',
        });
        if (!ok) return;

        setLoading(true);
        try {
            if (portalToken) {
                await supplierPortalTokenService.respondToCounterProposal(portalToken, existingResponse.id, accept);
            } else {
                await quotationService.respondToCounterProposal(existingResponse.id, accept);
            }
            showToast(accept ? 'Contraproposta aceita.' : 'Contraproposta recusada.');
            markSaved();
            onSave();
        } catch (err) {
            console.error("Error responding to counter proposal:", err);
            showToast(`Erro ao processar resposta: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSendSupplierCounter = async () => {
        if (!existingResponse) return;
        const ok = await confirm({
            title: 'Enviar contraproposta?',
            message: 'Os valores e condições preenchidos nesta tela vão para o comprador como uma nova contraproposta.',
            confirmLabel: 'Enviar',
        });
        if (!ok) return;

        setLoading(true);
        try {
            const counterProposal = {
                items: formData.items,
                deliveryDate: formData.deliveryDate,
                deliveryMethod: formData.deliveryMethod,
                paymentMethod: formData.paymentMethod,
                paymentTermType: formData.paymentTermType,
                paymentDays: formData.paymentDays,
                paymentInstallments: formData.paymentInstallments,
                notes: formData.notes
            };
            if (portalToken) {
                await supplierPortalTokenService.sendCounterProposal(portalToken, existingResponse.id, counterProposal);
            } else {
                await quotationService.sendCounterProposal(existingResponse.id, counterProposal, 'Fornecedor');
            }

            showToast('Contraproposta enviada.');
            markSaved();
            onSave();
        } catch (err) {
            console.error("Error sending supplier counter:", err);
            showToast(`Erro ao enviar contraproposta: ${err instanceof Error ? err.message : 'Erro desconhecido'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleBack = async () => {
        if (await confirmDiscard()) onBack();
    };

    const totalProposta = formData.items.reduce((sum, item) => sum + item.total, 0);
    const sugeridoDoItem = (code: string) =>
        existingResponse?.counterProposal?.items.find(ci => ci.code === code);

    // Campo com valor sugerido pelo comprador diferente do que o fornecedor tinha:
    // âmbar é cor SEMÂNTICA (divergência), não entra no `accent`.
    const inputBase = `w-full h-9 px-3 bg-gray-50 border rounded-[6px] text-sm font-normal text-gray-900 outline-none focus:ring-2 transition-all`;
    const inputClass = (divergente: boolean) =>
        `${inputBase} ${divergente ? 'border-amber-300 bg-amber-50 text-amber-700 ring-2 ring-amber-100' : `border-gray-200 ${A.ring}`}`;
    const sugestao = (texto: string) => (
        <p className="text-xs font-medium text-amber-600 mt-1">Sugerido: {texto}</p>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Cabeçalho §20 — h1 solto, subtítulo mt-1.5, ações à direita.
                Mesmo desenho do detalhe do pedido (SupplyChainOrderDetails). */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <button
                        onClick={handleBack}
                        className={`mt-1 p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 transition-all shadow-sm active:scale-95 group ${A.backHover}`}
                        title="Voltar"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-4 flex-wrap">
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                                Cotação <span className={A.text}>#{request.number}</span>
                            </h1>
                            <span className={`text-sm font-normal ${STATUS_STYLES[request.status] || 'text-gray-600'}`}>
                                {request.status}
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium flex items-center gap-2 flex-wrap">
                            <span>{request.title}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" />
                                {request.projectName || 'Obra não informada'}
                            </span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full" />
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                Prazo {formatDate(request.deadline)}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap md:justify-end">
                    <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-1" />
                    {emNegociacao ? (
                        <button
                            type="button"
                            onClick={handleSendSupplierCounter}
                            disabled={loading}
                            className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${A.primaryBtn}`}
                        >
                            <TrendingDown className="w-[15px] h-[15px]" />
                            Enviar contraproposta
                        </button>
                    ) : (
                        <button
                            type="submit"
                            form="quotation-form"
                            disabled={loading}
                            className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 ${A.primaryBtn}`}
                        >
                            <Send className="w-[15px] h-[15px]" />
                            {existingResponse ? 'Atualizar proposta' : 'Enviar proposta'}
                        </button>
                    )}
                </div>
            </div>

            {/* Abas §19.1 — trilho cinza dentro de card branco, h-7, ativa = bg-white
                + cor do acento. O coral do portal sai do mapa ACCENTS (§24). */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {abasVisiveis.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setAba(t.id)}
                            className={`flex items-center gap-1.5 px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                aba === t.id ? `bg-white ${A.text} shadow-sm` : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            <t.icon className="w-4 h-4" />
                            {t.label}
                            {t.id === 'itens' && <span className="text-gray-400">{formData.items.length}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {emNegociacao && (
                <div className="bg-amber-50 border border-amber-200 rounded-[10px] p-5">
                    <div className="flex items-start gap-4">
                        <div className="p-2.5 bg-amber-100 text-amber-600 rounded-[6px] shrink-0">
                            <TrendingDown className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-black text-amber-900 tracking-tight">Contraproposta recebida</h3>
                            <p className="text-sm text-amber-800 mt-1.5">
                                O comprador revisou sua proposta e sugeriu novos valores ou condições. Você pode aceitar
                                estes termos, manter sua proposta original ou ajustar os valores e enviar uma nova
                                contraproposta.
                            </p>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleNegotiationResponse(true)}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-[15px] h-[15px]" />
                                    Aceitar contraproposta
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleNegotiationResponse(false)}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-amber-700 border border-amber-200 rounded-[6px] hover:bg-amber-100 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <XCircle className="w-[15px] h-[15px]" />
                                    Recusar e manter original
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <form id="quotation-form" onSubmit={handleSubmit}>
                {aba === 'itens' && (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-6 py-2 border-r border-gray-100">Código</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Descrição</th>
                                        <th className="px-6 py-2 border-r border-gray-100 text-right">Qtd</th>
                                        <th className="px-6 py-2 border-r border-gray-100 text-right">Unitário</th>
                                        <th className="px-6 py-2 text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {formData.items.map((item, idx) => {
                                        const sugerido = sugeridoDoItem(item.code);
                                        const divergente = sugerido !== undefined && sugerido.unitPrice !== item.unitPrice;
                                        return (
                                            <tr key={`${item.code}-${idx}`} className="hover:bg-gray-50/70 transition-colors">
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600">{item.code}</td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">
                                                    <span className="block truncate max-w-[28rem]" title={item.description}>{item.description}</span>
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-600">
                                                    {item.quantity} {item.unit}
                                                </td>
                                                <td className="px-6 py-2.5 border-r border-gray-100 text-right">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        required
                                                        value={item.unitPrice}
                                                        onChange={e => handleUpdatePrice(idx, parseFloat(e.target.value) || 0)}
                                                        className={`w-32 h-9 px-3 text-right text-sm font-normal rounded-[6px] border outline-none focus:ring-2 transition-all ${
                                                            divergente
                                                                ? 'border-amber-300 bg-amber-50 text-amber-700 ring-2 ring-amber-100'
                                                                : `border-gray-200 bg-gray-50 text-gray-900 ${A.ring}`
                                                        }`}
                                                    />
                                                    {sugerido && (
                                                        <p className="text-xs font-medium text-amber-600 mt-1">
                                                            Sugerido: {formatBRL(sugerido.unitPrice)}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-2.5 text-right text-sm font-medium text-gray-800">
                                                    {formatBRL(item.total)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-gray-200 bg-gray-50">
                                        <td colSpan={4} className="px-6 py-3 text-right text-sm font-normal text-gray-500">
                                            Total da sua proposta
                                        </td>
                                        <td className="px-6 py-3 text-right text-base font-medium text-gray-900">
                                            {formatBRL(totalProposta)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {aba === 'condicoes' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5 space-y-4">
                            <h3 className={`text-sm font-semibold text-gray-700 flex items-center gap-2`}>
                                <Calendar className={`w-4 h-4 ${A.icon}`} />
                                Condições de entrega
                            </h3>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 block">Previsão de entrega</label>
                                <input
                                    type="date"
                                    required
                                    value={formData.deliveryDate}
                                    onChange={e => setCampo('deliveryDate', e.target.value)}
                                    className={inputClass(
                                        !!existingResponse?.counterProposal?.deliveryDate
                                        && existingResponse.counterProposal.deliveryDate !== existingResponse.deliveryDate,
                                    )}
                                />
                                {existingResponse?.counterProposal?.deliveryDate
                                    && existingResponse.counterProposal.deliveryDate !== existingResponse.deliveryDate
                                    && sugestao(formatDate(existingResponse.counterProposal.deliveryDate))}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 block">Forma de entrega</label>
                                <select
                                    value={formData.deliveryMethod}
                                    onChange={e => setCampo('deliveryMethod', e.target.value)}
                                    className={`${inputClass(
                                        !!existingResponse?.counterProposal?.deliveryMethod
                                        && existingResponse.counterProposal.deliveryMethod !== existingResponse.deliveryMethod,
                                    )} cursor-pointer`}
                                >
                                    <option value="CIF - Entrega por conta do fornecedor">CIF - Entrega por conta do fornecedor</option>
                                    <option value="FOB - Retirada por conta do comprador">FOB - Retirada por conta do comprador</option>
                                    <option value="Entrega Própria Fornecedor">Entrega Própria Fornecedor</option>
                                    <option value="Transportadora Terceirizada">Transportadora Terceirizada</option>
                                    <option value="Retirada em Mãos">Retirada em Mãos</option>
                                </select>
                                {existingResponse?.counterProposal?.deliveryMethod
                                    && existingResponse.counterProposal.deliveryMethod !== existingResponse.deliveryMethod
                                    && sugestao(existingResponse.counterProposal.deliveryMethod)}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 block">Local de entrega</label>
                                <input
                                    type="text"
                                    value={formData.deliveryLocation}
                                    onChange={e => setCampo('deliveryLocation', e.target.value)}
                                    placeholder="Canteiro de obras"
                                    className={inputClass(
                                        !!existingResponse?.counterProposal?.deliveryLocation
                                        && existingResponse.counterProposal.deliveryLocation !== existingResponse.deliveryLocation,
                                    )}
                                />
                                {existingResponse?.counterProposal?.deliveryLocation
                                    && existingResponse.counterProposal.deliveryLocation !== existingResponse.deliveryLocation
                                    && sugestao(existingResponse.counterProposal.deliveryLocation)}
                            </div>
                        </div>

                        <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm p-5 space-y-4">
                            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                <HandCoins className={`w-4 h-4 ${A.icon}`} />
                                Condições de pagamento
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 block">Método</label>
                                    <select
                                        value={formData.paymentMethod}
                                        onChange={e => setCampo('paymentMethod', e.target.value)}
                                        className={`${inputClass(
                                            !!existingResponse?.counterProposal?.paymentMethod
                                            && existingResponse.counterProposal.paymentMethod !== existingResponse.paymentMethod,
                                        )} cursor-pointer`}
                                    >
                                        <option value="Boleto">Boleto bancário</option>
                                        <option value="Pix">Pix</option>
                                        <option value="Cartão de Crédito">Cartão de crédito</option>
                                        <option value="Cartão de Débito">Cartão de débito</option>
                                        <option value="Transferência">Transferência bancária</option>
                                        <option value="Dinheiro">Dinheiro</option>
                                    </select>
                                    {existingResponse?.counterProposal?.paymentMethod
                                        && existingResponse.counterProposal.paymentMethod !== existingResponse.paymentMethod
                                        && sugestao(existingResponse.counterProposal.paymentMethod)}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 block">Prazo / parcelas</label>
                                    <div className={`flex items-center h-9 p-1 rounded-[6px] border gap-1 ${
                                        existingResponse?.counterProposal?.paymentTermType
                                        && existingResponse.counterProposal.paymentTermType !== existingResponse.paymentTermType
                                            ? 'bg-amber-50 border-amber-300'
                                            : 'bg-gray-50 border-gray-200'
                                    }`}>
                                        {(['Vista', 'Parcelado'] as const).map(tipo => (
                                            <button
                                                key={tipo}
                                                type="button"
                                                onClick={() => setCampo('paymentTermType', tipo)}
                                                className={`flex-1 h-7 rounded-[6px] text-sm font-medium transition-all ${
                                                    formData.paymentTermType === tipo ? A.toggleOn : 'text-gray-700 hover:text-gray-900'
                                                }`}
                                            >
                                                {tipo === 'Vista' ? 'À vista' : 'Parcelado'}
                                            </button>
                                        ))}
                                    </div>
                                    {existingResponse?.counterProposal?.paymentTermType
                                        && existingResponse.counterProposal.paymentTermType !== existingResponse.paymentTermType
                                        && sugestao(existingResponse.counterProposal.paymentTermType)}
                                </div>
                            </div>

                            {formData.paymentTermType === 'Vista' ? (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 block">Dias para pagamento</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={formData.paymentDays}
                                        onChange={e => setCampo('paymentDays', parseInt(e.target.value) || 0)}
                                        className={inputClass(
                                            existingResponse?.counterProposal?.paymentDays !== undefined
                                            && existingResponse.counterProposal.paymentDays !== existingResponse.paymentDays,
                                        )}
                                    />
                                    {existingResponse?.counterProposal?.paymentDays !== undefined
                                        && existingResponse.counterProposal.paymentDays !== existingResponse.paymentDays
                                        && sugestao(`${existingResponse.counterProposal.paymentDays} dias`)}
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-500 block">Número de parcelas</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.paymentInstallments}
                                        onChange={e => setCampo('paymentInstallments', parseInt(e.target.value) || 1)}
                                        className={inputClass(
                                            existingResponse?.counterProposal?.paymentInstallments !== undefined
                                            && existingResponse.counterProposal.paymentInstallments !== existingResponse.paymentInstallments,
                                        )}
                                    />
                                    {existingResponse?.counterProposal?.paymentInstallments !== undefined
                                        && existingResponse.counterProposal.paymentInstallments !== existingResponse.paymentInstallments
                                        && sugestao(`${existingResponse.counterProposal.paymentInstallments} parcelas`)}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-500 block">Observações</label>
                                <textarea
                                    value={formData.notes || ''}
                                    onChange={e => setCampo('notes', e.target.value)}
                                    placeholder="Validade da proposta, marcas, etc."
                                    className={`w-full h-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 outline-none focus:ring-2 resize-none transition-all ${A.ring}`}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {aba === 'negociacao' && (
                    <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-auto max-h-[70vh]">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                        <th className="px-6 py-2 border-r border-gray-100">Data</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Autor</th>
                                        <th className="px-6 py-2 border-r border-gray-100">Ação</th>
                                        <th className="px-6 py-2 border-r border-gray-100 text-right">Itens ajustados</th>
                                        <th className="px-6 py-2">Observações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {(existingResponse?.negotiationHistory ?? []).map((event, idx) => (
                                        <tr key={`${event.timestamp}-${idx}`} className="hover:bg-gray-50/70 transition-colors">
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-600 whitespace-nowrap">
                                                {formatDate(event.timestamp)}
                                            </td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{event.author}</td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-700">{event.action}</td>
                                            <td className="px-6 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-600">
                                                {event.changes.items?.length ?? 0}
                                            </td>
                                            <td className="px-6 py-2.5 text-sm font-normal text-gray-600">
                                                <span className="block truncate max-w-[24rem]" title={event.notes || ''}>
                                                    {event.notes || '—'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {(existingResponse?.negotiationHistory?.length ?? 0) === 0 && (
                                        <tr>
                                            <td colSpan={5}>
                                                <div className="text-center py-12">
                                                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Sem histórico de negociação</h3>
                                                    <p className="text-sm text-gray-500">
                                                        As rodadas de proposta e contraproposta aparecem aqui.
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </form>

            {request.description && aba === 'condicoes' && (
                <div className={`rounded-[10px] border p-5 ${A.panel}`}>
                    <p className="text-xs font-semibold text-slate-500 mb-1.5">Descrição da solicitação</p>
                    <p className="text-sm font-normal text-gray-700 leading-relaxed">{request.description}</p>
                </div>
            )}
        </div>
    );
};

export default QuotationResponseForm;
