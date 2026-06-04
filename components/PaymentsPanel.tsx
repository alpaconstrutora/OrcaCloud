import React from 'react';
import { CreditCard, CheckCircle2, Clock, AlertCircle, CalendarDays, Download } from 'lucide-react';
import { formatCurrency } from '../utils/financialMath';
import { investorContributionsService, InvestorContribution } from '../services/investorContributionsService';

interface PaymentsPanelProps {
    organizationId?: string;
    investorId?: string;
}

const TYPE_LABEL: Record<string, string> = {
    aporte: 'Aporte',
    retirada: 'Retirada',
    dividendo: 'Dividendo',
    distribuicao: 'Distribuição',
};

const STATUS_STYLE: Record<string, string> = {
    liquidado: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    pendente: 'bg-blue-50 text-blue-700 border-blue-100',
    atrasado: 'bg-red-50 text-red-700 border-red-100',
};

const STATUS_LABEL: Record<string, string> = {
    liquidado: 'Liquidado',
    pendente: 'Aguardando',
    atrasado: 'Atrasado',
};

const statusIcon = (status: string) => {
    if (status === 'liquidado') return <CheckCircle2 className="w-4 h-4" />;
    if (status === 'pendente') return <Clock className="w-4 h-4" />;
    if (status === 'atrasado') return <AlertCircle className="w-4 h-4" />;
    return null;
};

const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
};

const PaymentsPanel: React.FC<PaymentsPanelProps> = ({ organizationId, investorId }) => {
    const [contributions, setContributions] = React.useState<InvestorContribution[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!organizationId) { setLoading(false); return; }
        investorContributionsService.listByInvestor(organizationId, investorId)
            .then(setContributions)
            .catch(err => console.error('Error loading contributions', err))
            .finally(() => setLoading(false));
    }, [organizationId, investorId]);

    const totalPaid = contributions
        .filter(c => c.type === 'aporte' && c.status === 'liquidado')
        .reduce((acc, c) => acc + Number(c.amount), 0);

    const paidCount = contributions.filter(c => c.type === 'aporte' && c.status === 'liquidado').length;
    const aporteCount = contributions.filter(c => c.type === 'aporte').length;

    const nextDue = contributions
        .filter(c => c.status === 'pendente' && c.due_date)
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];

    const daysUntil = nextDue?.due_date
        ? Math.ceil((new Date(nextDue.due_date + 'T00:00:00').getTime() - Date.now()) / 86400000)
        : null;

    if (loading) {
        return <div className="py-12 text-center text-sm text-gray-400">Carregando movimentações...</div>;
    }

    if (contributions.length === 0) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 text-center">
                <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                <p className="text-sm font-bold text-gray-400">Nenhuma movimentação registrada.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Total Aportado</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-black text-gray-900">{formatCurrency(totalPaid)}</h3>
                        {aporteCount > 0 && <span className="text-xs font-bold text-emerald-500">{paidCount}/{aporteCount}</span>}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Próximo Vencimento</p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-black text-blue-600">{nextDue ? formatDate(nextDue.due_date) : '—'}</h3>
                        {daysUntil !== null && daysUntil >= 0 && (
                            <span className="text-xs font-bold text-gray-500">em {daysUntil} dias</span>
                        )}
                    </div>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl shadow-lg text-white relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                        <CreditCard size={100} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em] mb-2">Próxima Parcela</p>
                        <h3 className="text-2xl font-black">{nextDue ? formatCurrency(Number(nextDue.amount)) : '—'}</h3>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-900 flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-blue-600" />
                        Movimentações
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50">
                            <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <th className="px-8 py-4">Descrição</th>
                                <th className="px-8 py-4">Tipo</th>
                                <th className="px-8 py-4">Vencimento</th>
                                <th className="px-8 py-4">Valor</th>
                                <th className="px-8 py-4 text-center">Status</th>
                                <th className="px-8 py-4 text-right">Comprovante</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {contributions.map((item) => (
                                <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                                    <td className="px-8 py-5">
                                        <p className="font-bold text-gray-900 text-sm">{item.description || TYPE_LABEL[item.type]}</p>
                                    </td>
                                    <td className="px-8 py-5 text-sm font-medium text-gray-600">{TYPE_LABEL[item.type]}</td>
                                    <td className="px-8 py-5 text-sm font-medium text-gray-600">{formatDate(item.due_date)}</td>
                                    <td className="px-8 py-5 text-sm font-black text-gray-900">{formatCurrency(Number(item.amount))}</td>
                                    <td className="px-8 py-5">
                                        <div className={`flex items-center justify-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-tighter mx-auto w-fit ${STATUS_STYLE[item.status]}`}>
                                            {statusIcon(item.status)}
                                            {STATUS_LABEL[item.status]}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        {item.receipt_url ? (
                                            <button
                                                onClick={() => window.open(item.receipt_url, '_blank')}
                                                className="p-2 text-gray-400 hover:text-blue-600 transition-all"
                                                title="Baixar comprovante"
                                            >
                                                <Download className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <span className="text-[10px] text-gray-300">—</span>
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
