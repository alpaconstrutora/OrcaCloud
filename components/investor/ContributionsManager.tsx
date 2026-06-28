import React from 'react';
import { X, Plus, Trash2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/financialMath';
import {
    investorContributionsService,
    InvestorContribution,
    ContributionType,
    ContributionStatus,
} from '../../services/investorContributionsService';

interface Props {
    organizationId: string;
    projectId: string;
    projectName: string;
    investorId: string;
    onClose: () => void;
}

const TYPE_OPTIONS: { value: ContributionType; label: string }[] = [
    { value: 'aporte', label: 'Aporte' },
    { value: 'retirada', label: 'Retirada' },
    { value: 'dividendo', label: 'Dividendo' },
    { value: 'distribuicao', label: 'Distribuição' },
];

const STATUS_OPTIONS: { value: ContributionStatus; label: string }[] = [
    { value: 'pendente', label: 'Aguardando' },
    { value: 'liquidado', label: 'Liquidado' },
    { value: 'atrasado', label: 'Atrasado' },
];

const statusIcon = (s: string) => {
    if (s === 'liquidado') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    if (s === 'pendente') return <Clock className="w-4 h-4 text-blue-600" />;
    if (s === 'atrasado') return <AlertCircle className="w-4 h-4 text-red-600" />;
    return null;
};

const emptyForm = (): Partial<InvestorContribution> => ({
    type: 'aporte',
    amount: 0,
    status: 'pendente',
    due_date: '',
    description: '',
});

const ContributionsManager: React.FC<Props> = ({ organizationId, projectId, projectName, investorId, onClose }) => {
    const [items, setItems] = React.useState<InvestorContribution[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [form, setForm] = React.useState<Partial<InvestorContribution>>(emptyForm());
    const [saving, setSaving] = React.useState(false);

    const load = React.useCallback(() => {
        setLoading(true);
        investorContributionsService.listContributions(projectId, investorId)
            .then(setItems)
            .catch(err => console.error('Error loading contributions', err))
            .finally(() => setLoading(false));
    }, [projectId, investorId]);

    React.useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!form.amount || form.amount <= 0) { alert('Informe um valor maior que zero.'); return; }
        setSaving(true);
        try {
            await investorContributionsService.saveContribution({
                organization_id: organizationId,
                project_id: projectId,
                investor_id: investorId,
                type: form.type as ContributionType,
                amount: Number(form.amount),
                status: form.status as ContributionStatus,
                due_date: form.due_date || null,
                paid_date: form.status === 'liquidado' ? (form.due_date || new Date().toISOString().slice(0, 10)) : null,
                description: form.description,
            });
            setForm(emptyForm());
            load();
        } catch (err) {
            console.error('Error saving contribution', err);
            alert('Erro ao salvar movimentação.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await investorContributionsService.deleteContribution(id);
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (err) {
            console.error('Error deleting contribution', err);
        }
    };

    const totalAporte = items.filter(i => i.type === 'aporte' && i.status === 'liquidado')
        .reduce((a, i) => a + Number(i.amount), 0);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Aportes e Movimentações</h3>
                        <p className="text-xs text-gray-500">{projectName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* New entry form */}
                <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-100">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo</span>
                            <select
                                value={form.type}
                                onChange={e => setForm(f => ({ ...f, type: e.target.value as ContributionType }))}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Valor (R$)</span>
                            <input
                                type="number" min="0" step="0.01"
                                value={form.amount || ''}
                                onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0,00"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Vencimento</span>
                            <input
                                type="date"
                                value={form.due_date || ''}
                                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Status</span>
                            <select
                                value={form.status}
                                onChange={e => setForm(f => ({ ...f, status: e.target.value as ContributionStatus }))}
                                className="px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </label>
                        <button
                            onClick={handleAdd}
                            disabled={saving}
                            className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-button font-bold hover:bg-blue-700 disabled:opacity-60"
                        >
                            <Plus className="w-4 h-4" /> Adicionar
                        </button>
                    </div>
                    <input
                        type="text"
                        value={form.description || ''}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className="mt-3 w-full px-3 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Descrição (opcional) — ex: Cota de investimento Jan/26"
                    />
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
                    ) : items.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">Nenhuma movimentação registrada.</div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/50 sticky top-0">
                                <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    <th className="px-6 py-3">Descrição</th>
                                    <th className="px-6 py-3">Tipo</th>
                                    <th className="px-6 py-3">Vencimento</th>
                                    <th className="px-6 py-3 text-right">Valor</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {items.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-3 text-sm font-medium text-gray-800">{item.description || TYPE_OPTIONS.find(o => o.value === item.type)?.label}</td>
                                        <td className="px-6 py-3 text-table-body text-gray-500">{TYPE_OPTIONS.find(o => o.value === item.type)?.label}</td>
                                        <td className="px-6 py-3 text-table-body text-gray-500">{item.due_date ? new Date(item.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(Number(item.amount))}</td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center justify-center">{statusIcon(item.status)}</div>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <button
                                                onClick={() => handleDelete(item.id!)}
                                                className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="px-8 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <span className="text-xs text-gray-500">Total aportado (liquidado)</span>
                    <span className="text-lg font-black text-gray-900">{formatCurrency(totalAporte)}</span>
                </div>
            </div>
        </div>
    );
};

export default ContributionsManager;
