import React from 'react';
import { supabase } from '../lib/supabase';
import { Package, Building2, Calendar, FileText, Loader2, AlertTriangle, CheckCircle2, Clock, Truck } from 'lucide-react';

interface PublicOrder {
    id: string;
    number: string;
    status: string;
    items: Array<{ description: string; quantity: number; unit: string; unit_price: number; total: number }>;
    delivery_date?: string;
    delivery_method?: string;
    delivery_location?: string;
    payment_method?: string;
    payment_term_type?: string;
    payment_days?: number;
    payment_installments?: number;
    notes?: string;
    created_at: string;
    supplier_name: string;
    project_name: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    'Rascunho':   { label: 'Rascunho',   color: 'bg-gray-100 text-gray-600' },
    'Enviado':    { label: 'Enviado',     color: 'bg-blue-100 text-blue-700' },
    'Confirmado': { label: 'Confirmado',  color: 'bg-green-100 text-green-700' },
    'Em trânsito':{ label: 'Em trânsito', color: 'bg-yellow-100 text-yellow-700' },
    'Entregue':   { label: 'Entregue',    color: 'bg-emerald-100 text-emerald-700' },
    'Cancelado':  { label: 'Cancelado',   color: 'bg-red-100 text-red-700' },
};

interface Props {
    token: string;
}

const PublicOrderView: React.FC<Props> = ({ token }) => {
    const [order, setOrder] = React.useState<PublicOrder | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        (async () => {
            try {
                const { data, error } = await supabase.rpc('get_order_by_share_token', { p_token: token });
                if (error) throw error;
                if (!data) { setError('Pedido não encontrado ou link expirado.'); return; }
                setOrder(data as PublicOrder);
            } catch {
                setError('Erro ao carregar o pedido. Verifique o link e tente novamente.');
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const fmtCurrency = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    const fmtDate = (d?: string) =>
        d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

    const total = order?.items?.reduce((s, i) => s + (i.total || 0), 0) ?? 0;
    const statusCfg = order ? (STATUS_CONFIG[order.status] ?? { label: order.status, color: 'bg-gray-100 text-gray-600' }) : null;

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-md w-full text-center">
                <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-lg font-bold text-gray-800 mb-2">Link inválido</h2>
                <p className="text-sm text-gray-500">{error}</p>
            </div>
        </div>
    );

    if (!order) return null;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <Package className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-black text-gray-900 text-lg">OrçaCloud</span>
                </div>
                <a
                    href="/"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                    Acessar sistema completo →
                </a>
            </div>

            <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Título + status */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Pedido de Compra</p>
                            <h1 className="text-2xl font-black text-gray-900">#{order.number}</h1>
                            <p className="text-sm text-gray-500 mt-1">Emitido em {fmtDate(order.created_at.split('T')[0])}</p>
                        </div>
                        {statusCfg && (
                            <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${statusCfg.color}`}>
                                {statusCfg.label}
                            </span>
                        )}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="flex items-start gap-3">
                            <Building2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fornecedor</p>
                                <p className="text-sm font-semibold text-gray-800">{order.supplier_name}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Obra</p>
                                <p className="text-sm font-semibold text-gray-800">{order.project_name}</p>
                            </div>
                        </div>
                        {order.delivery_date && (
                            <div className="flex items-start gap-3">
                                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Entrega prevista</p>
                                    <p className="text-sm font-semibold text-gray-800">{fmtDate(order.delivery_date)}</p>
                                </div>
                            </div>
                        )}
                        {order.delivery_method && (
                            <div className="flex items-start gap-3">
                                <Truck className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Entrega</p>
                                    <p className="text-sm font-semibold text-gray-800">{order.delivery_method}{order.delivery_location ? ` — ${order.delivery_location}` : ''}</p>
                                </div>
                            </div>
                        )}
                        {order.payment_term_type && (
                            <div className="flex items-start gap-3">
                                <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Condições de pagamento</p>
                                    <p className="text-sm font-semibold text-gray-800">
                                        {order.payment_term_type}
                                        {order.payment_days ? ` — ${order.payment_days} dias` : ''}
                                        {order.payment_installments ? ` (${order.payment_installments}x)` : ''}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Itens */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest">Itens do Pedido</h2>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {order.items?.map((item, i) => (
                            <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{item.description}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity} {item.unit} × {fmtCurrency(item.unit_price)}</p>
                                </div>
                                <p className="text-sm font-black text-gray-900 shrink-0">{fmtCurrency(item.total)}</p>
                            </div>
                        ))}
                    </div>
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-600">Total</span>
                        <span className="text-lg font-black text-indigo-600">{fmtCurrency(total)}</span>
                    </div>
                </div>

                {/* Observações */}
                {order.notes && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Observações</p>
                        <p className="text-sm text-amber-800 whitespace-pre-wrap">{order.notes}</p>
                    </div>
                )}

                {/* CTA login */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-sm font-bold text-indigo-800">Precisa confirmar, negociar ou enviar NF?</p>
                        <p className="text-xs text-indigo-600 mt-0.5">Acesse o sistema completo com sua conta.</p>
                    </div>
                    <a
                        href="/"
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 transition-all shrink-0"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Acessar OrçaCloud
                    </a>
                </div>
            </div>
        </div>
    );
};

export default PublicOrderView;
