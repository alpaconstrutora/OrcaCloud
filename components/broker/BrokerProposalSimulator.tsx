import React, { useState, useMemo, useCallback } from 'react';
import { Send, User, Phone, Mail, CreditCard, DollarSign, Percent, ArrowRight } from 'lucide-react';
import type { BrokerUnit, BrokerProposal } from '../../types';

interface BrokerProposalSimulatorProps {
    unit: BrokerUnit | null;
    brokerEmail: string;
    organizationId: string;
    onSubmitProposal: (proposal: Partial<BrokerProposal>) => void;
    onCancel: () => void;
}

const BrokerProposalSimulator: React.FC<BrokerProposalSimulatorProps> = ({
    unit,
    brokerEmail,
    organizationId,
    onSubmitProposal,
    onCancel
}) => {
    // Buyer info
    const [buyerName, setBuyerName] = useState('');
    const [buyerCpf, setBuyerCpf] = useState('');
    const [buyerEmail, setBuyerEmail] = useState('');
    const [buyerPhone, setBuyerPhone] = useState('');
    const [buyerIncome, setBuyerIncome] = useState(0);

    // Payment simulation
    const [downPaymentPct, setDownPaymentPct] = useState(20);
    const [monthlyInstallments, setMonthlyInstallments] = useState(36);
    const [financingPct, setFinancingPct] = useState(0);
    const [discountPct, setDiscountPct] = useState(0);
    const [notes, setNotes] = useState('');

    // Active step
    const [activeStep, setActiveStep] = useState<'buyer' | 'payment' | 'review'>('buyer');

    const unitPrice = unit?.current_price || 0;

    const simulation = useMemo(() => {
        const discount = unitPrice * (discountPct / 100);
        const totalValue = unitPrice - discount;
        const downPayment = totalValue * (downPaymentPct / 100);
        const financingValue = totalValue * (financingPct / 100);
        const monthlyTotal = totalValue - downPayment - financingValue;
        const monthlyValue = monthlyInstallments > 0 ? monthlyTotal / monthlyInstallments : 0;
        const incomeRatio = buyerIncome > 0 ? (monthlyValue / buyerIncome) * 100 : 0;

        return {
            totalValue,
            discount,
            downPayment,
            financingValue,
            monthlyTotal,
            monthlyValue,
            incomeRatio,
            remainingPct: 100 - downPaymentPct - financingPct,
        };
    }, [unitPrice, downPaymentPct, monthlyInstallments, financingPct, discountPct, buyerIncome]);

    const formatCurrency = useCallback((value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value), []);

    const formatCpf = (value: string) => {
        return value.replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
            .substring(0, 14);
    };

    const formatPhone = (value: string) => {
        return value.replace(/\D/g, '')
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d{4})$/, '$1-$2')
            .substring(0, 15);
    };

    const canProceedBuyer = buyerName.length >= 3 && buyerCpf.length >= 14;
    const canProceedPayment = simulation.remainingPct >= 0;
    const canSubmit = canProceedBuyer && canProceedPayment;

    const handleSubmit = () => {
        if (!unit || !canSubmit) return;
        onSubmitProposal({
            property_id: unit.id,
            broker_email: brokerEmail,
            organization_id: organizationId,
            buyer_name: buyerName,
            buyer_cpf: buyerCpf,
            buyer_email: buyerEmail,
            buyer_phone: buyerPhone,
            buyer_income: buyerIncome,
            unit_price: unitPrice,
            down_payment: simulation.downPayment,
            monthly_installments: monthlyInstallments,
            monthly_value: simulation.monthlyValue,
            financing_value: simulation.financingValue,
            discount_pct: discountPct,
            total_value: simulation.totalValue,
            status: 'ENVIADA',
            notes,
        });
    };

    if (!unit) return null;

    const StepButton = ({ step, label, number }: { step: 'buyer' | 'payment' | 'review'; label: string; number: number }) => (
        <button
            onClick={() => setActiveStep(step)}
            className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold transition-all ${activeStep === step
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
        >
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${activeStep === step ? 'bg-white text-indigo-600' : 'bg-gray-300 text-white'}`}>
                {number}
            </span>
            {label}
        </button>
    );

    return (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white">Simulador de Proposta</h2>
                        <p className="text-indigo-200 text-sm mt-1">
                            Unidade {unit.number || unit.name} • {unit.block || 'Geral'} • {unit.bedrooms || unit.specs?.bedrooms ? `${unit.bedrooms || unit.specs?.bedrooms} Dormitório${(unit.bedrooms || unit.specs?.bedrooms) !== 1 ? 's' : ''}` : (unit.typology || 'Padrão')} • {unit.private_area || unit.area}m²
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Valor da Unidade</p>
                        <p className="text-2xl font-black text-white">{formatCurrency(unitPrice)}</p>
                    </div>
                </div>
            </div>

            {/* Step Navigation */}
            <div className="flex gap-3 p-4 border-b border-gray-100 bg-gray-50">
                <StepButton step="buyer" label="Comprador" number={1} />
                <StepButton step="payment" label="Pagamento" number={2} />
                <StepButton step="review" label="Revisão" number={3} />
            </div>

            <div className="p-6">
                {/* Step 1: Buyer Info */}
                {activeStep === 'buyer' && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
                                    <User className="w-3.5 h-3.5 inline mr-1" />Nome Completo *
                                </label>
                                <input type="text" value={buyerName} onChange={e => setBuyerName(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium"
                                    placeholder="Nome do comprador" />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
                                    <CreditCard className="w-3.5 h-3.5 inline mr-1" />CPF *
                                </label>
                                <input type="text" value={buyerCpf} onChange={e => setBuyerCpf(formatCpf(e.target.value))}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium"
                                    placeholder="000.000.000-00" maxLength={14} />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
                                    <Mail className="w-3.5 h-3.5 inline mr-1" />E-mail
                                </label>
                                <input type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium"
                                    placeholder="email@exemplo.com" />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
                                    <Phone className="w-3.5 h-3.5 inline mr-1" />Telefone
                                </label>
                                <input type="text" value={buyerPhone} onChange={e => setBuyerPhone(formatPhone(e.target.value))}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium"
                                    placeholder="(00) 00000-0000" maxLength={15} />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">
                                    <DollarSign className="w-3.5 h-3.5 inline mr-1" />Renda Mensal
                                </label>
                                <input type="number" value={buyerIncome || ''} onChange={e => setBuyerIncome(Number(e.target.value))}
                                    className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium"
                                    placeholder="R$ 0,00" />
                            </div>
                        </div>
                        <div className="flex justify-end pt-4">
                            <button onClick={() => setActiveStep('payment')} disabled={!canProceedBuyer}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20">
                                Próximo <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Payment Simulation */}
                {activeStep === 'payment' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {unit.purpose === 'RENTAL' ? (
                            /* Rental Flow */
                            <div className="space-y-6">
                                <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                                    <label className="block text-xs font-black text-blue-600 uppercase tracking-wider mb-3">
                                        Prazo do Contrato (Meses)
                                    </label>
                                    <select value={monthlyInstallments} onChange={e => setMonthlyInstallments(Number(e.target.value))}
                                        className="w-full p-2.5 rounded-lg border border-blue-200 text-sm font-bold bg-white mb-2">
                                        {[12, 24, 30, 36, 48].map(n => (
                                            <option key={n} value={n}>{n} meses</option>
                                        ))}
                                    </select>
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-2xl font-black text-blue-700">{monthlyInstallments} meses</span>
                                        <span className="text-sm font-bold text-blue-600">{formatCurrency(unitPrice)}/mês</span>
                                    </div>
                                </div>

                                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-center gap-4">
                                    <Percent className="w-5 h-5 text-amber-600" />
                                    <div className="flex-1">
                                        <label className="text-xs font-black text-amber-600 uppercase tracking-wider">Desconto Solicitado (no aluguel)</label>
                                        <input type="range" min={0} max={20} step={1} value={discountPct}
                                            onChange={e => setDiscountPct(Number(e.target.value))}
                                            className="w-full accent-amber-500" />
                                    </div>
                                    <span className="text-xl font-black text-amber-700 min-w-[60px] text-right">{discountPct}%</span>
                                    {discountPct > 0 && <span className="text-sm font-bold text-amber-600">-{formatCurrency(simulation.discount)}</span>}
                                </div>
                            </div>
                        ) : (
                            /* Sales Flow */
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Sliders */}
                                <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                                    <label className="block text-xs font-black text-emerald-600 uppercase tracking-wider mb-3">
                                        Entrada (Ato)
                                    </label>
                                    <input type="range" min={5} max={100} value={downPaymentPct}
                                        onChange={e => setDownPaymentPct(Number(e.target.value))}
                                        className="w-full accent-emerald-600 mb-2" />
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-2xl font-black text-emerald-700">{downPaymentPct}%</span>
                                        <span className="text-sm font-bold text-emerald-600">{formatCurrency(simulation.downPayment)}</span>
                                    </div>
                                </div>

                                <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                                    <label className="block text-xs font-black text-blue-600 uppercase tracking-wider mb-3">
                                        Parcelas Mensais
                                    </label>
                                    <select value={monthlyInstallments} onChange={e => setMonthlyInstallments(Number(e.target.value))}
                                        className="w-full p-2.5 rounded-lg border border-blue-200 text-sm font-bold bg-white mb-2">
                                        {[12, 24, 36, 48, 60, 72, 84, 96, 120].map(n => (
                                            <option key={n} value={n}>{n}x</option>
                                        ))}
                                    </select>
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-2xl font-black text-blue-700">{monthlyInstallments}x</span>
                                        <span className="text-sm font-bold text-blue-600">{formatCurrency(simulation.monthlyValue)}</span>
                                    </div>
                                </div>

                                <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
                                    <label className="block text-xs font-black text-purple-600 uppercase tracking-wider mb-3">
                                        Financiamento
                                    </label>
                                    <input type="range" min={0} max={Math.max(0, 100 - downPaymentPct)} value={financingPct}
                                        onChange={e => setFinancingPct(Number(e.target.value))}
                                        className="w-full accent-purple-600 mb-2" />
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-2xl font-black text-purple-700">{financingPct}%</span>
                                        <span className="text-sm font-bold text-purple-600">{formatCurrency(simulation.financingValue)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {unit.purpose !== 'RENTAL' && (
                            /* Discount for Sales */
                            <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-center gap-4">
                                <Percent className="w-5 h-5 text-amber-600" />
                                <div className="flex-1">
                                    <label className="text-xs font-black text-amber-600 uppercase tracking-wider">Desconto Solicitado</label>
                                    <input type="range" min={0} max={10} step={0.5} value={discountPct}
                                        onChange={e => setDiscountPct(Number(e.target.value))}
                                        className="w-full accent-amber-500" />
                                </div>
                                <span className="text-xl font-black text-amber-700 min-w-[60px] text-right">{discountPct}%</span>
                                {discountPct > 0 && <span className="text-sm font-bold text-amber-600">-{formatCurrency(simulation.discount)}</span>}
                            </div>
                        )}

                        {/* Summary */}
                        <div className="bg-gray-900 rounded-xl p-6 text-white">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                                {unit.purpose === 'RENTAL' ? 'Resumo da Locação' : 'Resumo da Simulação'}
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">
                                        {unit.purpose === 'RENTAL' ? 'Aluguel Proposto' : 'Valor Total'}
                                    </p>
                                    <p className="text-lg font-black">{formatCurrency(simulation.totalValue)}</p>
                                </div>
                                {unit.purpose !== 'RENTAL' && (
                                    <>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Entrada</p>
                                            <p className="text-lg font-black text-emerald-400">{formatCurrency(simulation.downPayment)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Parcela Mensal</p>
                                            <p className="text-lg font-black text-blue-400">{formatCurrency(simulation.monthlyValue)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Financiamento</p>
                                            <p className="text-lg font-black text-purple-400">{formatCurrency(simulation.financingValue)}</p>
                                        </div>
                                    </>
                                )}
                                {unit.purpose === 'RENTAL' && (
                                    <>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Meses de Contrato</p>
                                            <p className="text-lg font-black text-blue-400">{monthlyInstallments}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Desconto</p>
                                            <p className="text-lg font-black text-amber-400">{discountPct}%</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Valor Original</p>
                                            <p className="text-lg font-black text-gray-500 line-through decoration-red-500">{formatCurrency(unitPrice)}</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {unit.purpose !== 'RENTAL' && simulation.incomeRatio > 0 && (
                                <div className={`mt-4 p-3 rounded-lg ${simulation.incomeRatio > 30 ? 'bg-red-900/30 border border-red-700' : 'bg-emerald-900/30 border border-emerald-700'}`}>
                                    <p className="text-xs font-bold">
                                        {simulation.incomeRatio > 30
                                            ? `⚠️ Parcela compromete ${simulation.incomeRatio.toFixed(1)}% da renda (acima de 30%)`
                                            : `✓ Parcela compromete ${simulation.incomeRatio.toFixed(1)}% da renda (dentro do limite)`
                                        }
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between pt-2">
                            <button onClick={() => setActiveStep('buyer')}
                                className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all">
                                Voltar
                            </button>
                            <button onClick={() => setActiveStep('review')}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">
                                Revisar <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Review & Submit */}
                {activeStep === 'review' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Buyer Summary */}
                            <div className="bg-gray-50 rounded-xl p-5">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
                                    {unit.purpose === 'RENTAL' ? 'Locatário' : 'Comprador'}
                                </h4>
                                <div className="space-y-2">
                                    <p className="text-sm"><span className="font-bold text-gray-500">Nome:</span> <span className="font-bold text-gray-900">{buyerName}</span></p>
                                    <p className="text-sm"><span className="font-bold text-gray-500">CPF:</span> <span className="font-bold text-gray-900">{buyerCpf}</span></p>
                                    {buyerEmail && <p className="text-sm"><span className="font-bold text-gray-500">E-mail:</span> <span className="font-bold text-gray-900">{buyerEmail}</span></p>}
                                    {buyerPhone && <p className="text-sm"><span className="font-bold text-gray-500">Telefone:</span> <span className="font-bold text-gray-900">{buyerPhone}</span></p>}
                                    {buyerIncome > 0 && <p className="text-sm"><span className="font-bold text-gray-500">{unit.purpose === 'RENTAL' ? 'Renda Comprovada:' : 'Renda:'}</span> <span className="font-bold text-gray-900">{formatCurrency(buyerIncome)}</span></p>}
                                </div>
                            </div>

                            {/* Payment Summary */}
                            <div className="bg-gray-50 rounded-xl p-5">
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
                                    {unit.purpose === 'RENTAL' ? 'Condições de Locação' : 'Condições de Venda'}
                                </h4>
                                <div className="space-y-2">
                                    <p className="text-sm"><span className="font-bold text-gray-500">Unidade:</span> <span className="font-bold text-gray-900">{unit?.number} ({unit?.block})</span></p>
                                    {unit.purpose === 'RENTAL' ? (
                                        <>
                                            <p className="text-sm"><span className="font-bold text-gray-500">Aluguel:</span> <span className="font-bold text-blue-600">{formatCurrency(simulation.totalValue)}/mês</span></p>
                                            <p className="text-sm"><span className="font-bold text-gray-500">Prazo:</span> <span className="font-bold text-gray-900">{monthlyInstallments} meses</span></p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-sm"><span className="font-bold text-gray-500">Valor total:</span> <span className="font-bold text-gray-900">{formatCurrency(simulation.totalValue)}</span></p>
                                            <p className="text-sm"><span className="font-bold text-gray-500">Entrada:</span> <span className="font-bold text-emerald-600">{formatCurrency(simulation.downPayment)} ({downPaymentPct}%)</span></p>
                                            <p className="text-sm"><span className="font-bold text-gray-500">Parcelas:</span> <span className="font-bold text-blue-600">{monthlyInstallments}x de {formatCurrency(simulation.monthlyValue)}</span></p>
                                        </>
                                    )}
                                    {unit.purpose !== 'RENTAL' && financingPct > 0 && <p className="text-sm"><span className="font-bold text-gray-500">Financiamento:</span> <span className="font-bold text-purple-600">{formatCurrency(simulation.financingValue)} ({financingPct}%)</span></p>}
                                    {discountPct > 0 && <p className="text-sm"><span className="font-bold text-gray-500">Desconto:</span> <span className="font-bold text-amber-600">{discountPct}% ({formatCurrency(simulation.discount)})</span></p>}
                                </div>
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-1.5">Observações</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                                className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
                                placeholder="Notas adicionais para a incorporadora..." />
                        </div>

                        <div className="flex justify-between pt-2">
                            <button onClick={() => setActiveStep('payment')}
                                className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all">
                                Voltar
                            </button>
                            <div className="flex gap-3">
                                <button onClick={onCancel}
                                    className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all">
                                    Cancelar
                                </button>
                                <button onClick={handleSubmit} disabled={!canSubmit}
                                    className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-500/20 active:scale-95 disabled:opacity-50">
                                    <Send className="w-4 h-4" />
                                    Enviar Proposta
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BrokerProposalSimulator;
