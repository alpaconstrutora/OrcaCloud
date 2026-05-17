
import React from 'react';
import {
    CreditCard,
    CheckCircle2,
    Clock,
    AlertCircle,
    QrCode,
    Download,
    CalendarDays,
    ArrowRight
} from 'lucide-react';
import { formatCurrency } from '../utils/financialMath';

interface Installment {
    id: string;
    dueDate: string;
    amount: number;
    status: 'paid' | 'pending' | 'overdue';
    description: string;
}

const PaymentsPanel: React.FC = () => {
    // Mock data for installments
    const installments: Installment[] = [
        { id: '1', dueDate: '15/01/2026', amount: 5000, status: 'paid', description: 'Cota de Investimento - Jan/26' },
        { id: '2', dueDate: '15/02/2026', amount: 5000, status: 'paid', description: 'Cota de Investimento - Fev/26' },
        { id: '3', dueDate: '15/03/2026', amount: 5000, status: 'pending', description: 'Cota de Investimento - Mar/26' },
        { id: '4', dueDate: '15/04/2026', amount: 5000, status: 'pending', description: 'Cota de Investimento - Abr/26' },
    ];

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'pending': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'overdue': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return <CheckCircle2 className="w-4 h-4" />;
            case 'pending': return <Clock className="w-4 h-4" />;
            case 'overdue': return <AlertCircle className="w-4 h-4" />;
            default: return null;
        }
    };

    return (
        <div className="space-y-8">
            {/* Header Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Total Pago</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-black text-gray-900">{formatCurrency(10000)}</h3>
                        <span className="text-xs font-bold text-emerald-500">2/4</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Próximo Vencimento</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-black text-blue-600">15/03/26</h3>
                        <span className="text-xs font-bold text-gray-500">em 28 dias</span>
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-lg text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                        <CreditCard size={100} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em] mb-2">Valor da Parcela</p>
                        <h3 className="text-2xl font-black">{formatCurrency(5000)}</h3>
                        <button className="mt-4 flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold transition-all">
                            <QrCode className="w-4 h-4" /> Pagar com PIX
                        </button>
                    </div>
                </div>
            </div>

            {/* Installment History */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-blue-600" />
                        Cronograma de Aportes
                    </h3>
                    <button className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-2">
                        Baixar Extrato <Download className="w-4 h-4" />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50">
                            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <th className="px-8 py-4">Descrição</th>
                                <th className="px-8 py-4">Vencimento</th>
                                <th className="px-8 py-4">Valor</th>
                                <th className="px-8 py-4 text-center">Status</th>
                                <th className="px-8 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {installments.map((item) => (
                                <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                                    <td className="px-8 py-5">
                                        <p className="font-bold text-gray-900 text-sm">{item.description}</p>
                                        <p className="text-[10px] text-gray-400">ID: {item.id}002349</p>
                                    </td>
                                    <td className="px-8 py-5 text-sm font-medium text-gray-600">{item.dueDate}</td>
                                    <td className="px-8 py-5 text-sm font-black text-gray-900">{formatCurrency(item.amount)}</td>
                                    <td className="px-8 py-5">
                                        <div className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-tighter mx-auto w-fit ${getStatusStyle(item.status)}`}>
                                            {getStatusIcon(item.status)}
                                            {item.status === 'paid' ? 'Liquidado' : item.status === 'pending' ? 'Aguardando' : 'Atrasado'}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        {item.status !== 'paid' ? (
                                            <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all group/btn">
                                                <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                                            </button>
                                        ) : (
                                            <button className="p-2 text-gray-400 hover:text-gray-600 transition-all">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PaymentsPanel;
