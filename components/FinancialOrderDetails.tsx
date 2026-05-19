import React, { useState, useEffect } from 'react';
import {
    X,
    CheckCircle2,
    Clock,
    CreditCard,
    Building2,
    Wallet,
    Filter,
    Save,
    AlertCircle,
    Calendar,
    ArrowLeft,
    HandCoins
} from 'lucide-react';
import HierarchicalSelect from './HierarchicalSelect';
import { PurchaseOrder, PaymentAccount, CostCenter, ChartOfAccount } from '../types';
import { orderService } from '../services/orderService';
import { organizationService } from '../services/organizationService';
import { financialRegistryService } from '../services/financialRegistryService';
import { supabase } from '../lib/supabase';

interface FinancialOrderDetailsProps {
    orderId: string;
    onClose: () => void;
    onUpdate?: () => void;
}

const FinancialOrderDetails: React.FC<FinancialOrderDetailsProps> = ({ orderId, onClose, onUpdate }) => {
    const [order, setOrder] = useState<PurchaseOrder | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Registries state
    const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [coa, setCoa] = useState<ChartOfAccount[]>([]);

    // Form state
    const [isApproved, setIsApproved] = useState(false);
    const [bankAccount, setBankAccount] = useState('');
    const [costCenter, setCostCenter] = useState('');
    const [chartOfAccounts, setChartOfAccounts] = useState('');

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // 1. Fetch Order
                const { data: orderData, error: orderError } = await supabase
                    .from('purchase_orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();

                if (orderError) throw orderError;

                if (orderData) {
                    const mappedOrder: PurchaseOrder = {
                        id: orderData.id,
                        number: orderData.number,
                        projectId: orderData.project_id,
                        supplierId: orderData.supplier_id,
                        supplierName: orderData.supplier_name,
                        deliveryDate: orderData.delivery_date,
                        status: orderData.status,
                        paymentMethod: orderData.payment_method,
                        paymentTermType: orderData.payment_term_type,
                        paymentDays: orderData.payment_days,
                        paymentInstallments: orderData.payment_installments,
                        isFinancialApproved: orderData.is_financial_approved,
                        bankAccount: orderData.bank_account,
                        costCenter: orderData.cost_center,
                        chartOfAccounts: orderData.chart_of_accounts,
                        notes: orderData.notes,
                        items: orderData.items
                    };
                    setOrder(mappedOrder);
                    setIsApproved(orderData.is_financial_approved || false);
                    setBankAccount(orderData.bank_account || '');
                    setCostCenter(orderData.cost_center || '');
                    setChartOfAccounts(orderData.chart_of_accounts || '');
                }

                // 2. Fetch Organizations & Registries
                const orgs = await organizationService.listOrganizations();
                if (orgs && orgs.length > 0) {
                    const orgId = orgs[0].id; // Simple approach: use first available org
                    const [accs, centers, accounts_coa] = await Promise.all([
                        financialRegistryService.listPaymentAccounts(orgId),
                        financialRegistryService.listCostCenters(orgId),
                        financialRegistryService.listChartOfAccounts(orgId)
                    ]);
                    setAccounts(accs);
                    setCostCenters(centers);
                    setCoa(accounts_coa);
                }

            } catch (err) {
                console.error('Error fetching data for financial view:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, [orderId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await orderService.updateOrder(orderId, {
                isFinancialApproved: isApproved,
                bankAccount: bankAccount,
                costCenter: costCenter,
                chartOfAccounts: chartOfAccounts
            });
            if (onUpdate) onUpdate();
            onClose();
        } catch (err) {
            console.error('Error saving financial details:', err);
            alert('Erro ao salvar os dados financeiros.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl animate-pulse">
                <HandCoins className="w-12 h-12 text-gray-200 mb-4" />
                <div className="h-4 w-48 bg-gray-50 rounded mb-2"></div>
                <div className="h-3 w-32 bg-gray-50 rounded"></div>
            </div>
        );
    }

    if (!order) return <div className="p-20 text-center text-gray-500 font-bold uppercase tracking-widest">Pedido não encontrado</div>;

    const totalValue = order.items.reduce((sum, item) => sum + (item.total || 0), 0);
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    // Generate installments for display
    const renderInstallments = () => {
        if (order.paymentTermType === 'Parcelado') {
            const count = order.paymentInstallments || 1;
            const installmentValue = totalValue / count;
            const baseDate = order.deliveryDate ? new Date(order.deliveryDate) : new Date();

            return (
                <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Cronograma de Parcelas</h4>
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 divide-y divide-gray-200 overflow-hidden">
                        {Array.from({ length: count }).map((_, i) => {
                            const dueDate = new Date(baseDate);
                            dueDate.setMonth(dueDate.getMonth() + i + 1);
                            return (
                                <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-white transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-900">
                                            {i + 1}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900">Parcela {i + 1}/{count}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Vencimento: {dueDate.toLocaleDateString('pt-BR')}</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black text-gray-900">{fmt(installmentValue)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        } else {
            const days = order.paymentDays || 0;
            const dueDate = order.deliveryDate ? new Date(order.deliveryDate) : new Date();
            dueDate.setDate(dueDate.getDate() + days);

            return (
                <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Condição À Vista</h4>
                    <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white rounded-xl border border-emerald-100">
                                <Calendar className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-gray-900">Pagamento Único (D+{days})</p>
                                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Previsão: {dueDate.toLocaleDateString('pt-BR')}</p>
                            </div>
                        </div>
                        <span className="text-xl font-black text-gray-900">{fmt(totalValue)}</span>
                    </div>
                </div>
            );
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-[2.5rem] overflow-hidden">
            {/* Modal Header */}
            <div className="px-10 py-8 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100">
                        <Wallet className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Financeiro do Pedido</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">#{order.number || order.id.slice(0, 8)} • {fmt(totalValue)}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-white hover:text-red-500 rounded-xl transition-all border border-transparent hover:border-red-100">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-10">
                {/* Status & Approval Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Info Card */}
                    <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resumo do Pedido</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Status de Suprimentos</span>
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${order.status === 'Confirmado' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {order.status}
                                </span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Forma de Pagamento</span>
                                <span className="text-xs font-black text-gray-900 uppercase">{order.paymentMethod || 'A combinar'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Condição</span>
                                <span className="text-xs font-black text-indigo-600 uppercase">{order.paymentTermType || 'Vista'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Approval Toggle Card */}
                    <div className={`p-8 rounded-[2rem] border transition-all duration-500 flex flex-col justify-between ${isApproved ? 'bg-emerald-50/30 border-emerald-100 shadow-emerald-50/50' : 'bg-rose-50/30 border-rose-100 shadow-rose-50/50'}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isApproved ? 'text-emerald-600' : 'text-rose-600'}`}>Status de Aprovação</h3>
                                <p className="text-xl font-black text-gray-900 tracking-tight">{isApproved ? 'APROVADO P/ PAGAMENTO' : 'AGUARDANDO APROVAÇÃO'}</p>
                            </div>
                            <div className={`p-3 rounded-2xl ${isApproved ? 'bg-white text-emerald-500 border border-emerald-100' : 'bg-white text-rose-500 border border-rose-100'}`}>
                                {isApproved ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                            </div>
                        </div>

                        {/* Validation: Only allow approval if received */}
                        {['Recebido', 'Divergência'].includes(order.status) || isApproved ? (
                            <button
                                onClick={() => setIsApproved(!isApproved)}
                                className={`mt-6 w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${isApproved ? 'bg-rose-500 text-white shadow-rose-200 hover:bg-rose-600' : 'bg-emerald-600 text-white shadow-emerald-200 hover:bg-emerald-700'}`}
                            >
                                {isApproved ? 'REMOVER APROVAÇÃO' : 'APROVAR AGORA'}
                            </button>
                        ) : (
                            <div className="mt-6 space-y-3">
                                <div className="p-4 bg-white/50 rounded-2xl border border-rose-100 flex items-start gap-3">
                                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                    <p className="text-[10px] font-bold text-rose-700 uppercase leading-relaxed text-left">
                                        Aguardando confirmação de recebimento pelo setor de suprimentos para permitir aprovação.
                                    </p>
                                </div>
                                <button
                                    disabled
                                    className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-400 cursor-not-allowed"
                                >
                                    APROVAÇÃO BLOQUEADA
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Allocation Section */}
                <div className="space-y-6">
                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] flex items-center gap-3">
                        <Filter className="w-4 h-4 text-indigo-600" />
                        Alocação do Gasto
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] px-1">Conta de Pagamento</label>
                            <div className="relative group">
                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                                <select
                                    value={bankAccount}
                                    onChange={(e) => setBankAccount(e.target.value)}
                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                                >
                                    <option value="">Selecione uma conta...</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.name}>{acc.name}</option>
                                    ))}
                                    {!accounts.length && <option value="" disabled>Nenhuma conta cadastrada</option>}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] px-1">Centro de Custo</label>
                            <HierarchicalSelect
                                items={costCenters}
                                value={costCenter}
                                onChange={setCostCenter}
                                valueField="name"
                                placeholder="Selecione o centro de custo..."
                                hoverCls="hover:bg-indigo-50"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] px-1">Plano de Contas</label>
                            <HierarchicalSelect
                                items={coa}
                                value={chartOfAccounts}
                                onChange={setChartOfAccounts}
                                valueField="code"
                                placeholder="Selecione o plano de contas..."
                                hoverCls="hover:bg-indigo-50"
                            />
                        </div>
                    </div>
                </div>

                {/* Installments Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    <div className="lg:col-span-2">
                        {renderInstallments()}
                    </div>
                    <div className="bg-amber-50 rounded-[2rem] border border-amber-100 p-8 self-start">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-white rounded-xl shadow-sm">
                                <AlertCircle className="w-6 h-6 text-amber-500" />
                            </div>
                            <h4 className="text-sm font-black text-amber-900 uppercase tracking-widest leading-tight">Nota Gerencial</h4>
                        </div>
                        <p className="text-xs font-bold text-amber-800 leading-relaxed italic">
                            "As parcelas listadas ao lado são calculadas automaticamente com base na entrega do pedido. A aprovação financeira é necessária para liberar o pagamento no fluxo de caixa real."
                        </p>
                    </div>
                </div>
            </div>

            {/* Modal Footer */}
            <div className="px-10 py-8 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-4">
                <button onClick={onClose} className="px-8 py-4 bg-white text-gray-400 border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-gray-600 transition-all">
                    Cancelar
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-3 px-10 py-4 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-gray-200 disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Gravando...' : 'Salvar Dados Financeiros'}
                </button>
            </div>
        </div>
    );
};

export default FinancialOrderDetails;
