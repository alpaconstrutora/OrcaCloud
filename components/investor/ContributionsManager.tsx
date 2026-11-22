import React from 'react';
import { X, Plus, CheckCircle2, Clock, AlertCircle, XCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/financialMath';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { storageService } from '../../services/storageService';
import { abrirArquivoAssinado, BUCKET_DOCUMENTOS } from '../../lib/storageAssinado';
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
    // Fase C6 (plano 2026-11-21-portal-do-investidor-consolidacao): estornado; não entra em nenhuma soma.
    { value: 'cancelado', label: 'Cancelado' },
];

/** Forma de pagamento (Fase C4): o portal mostra na coluna "Forma". */
export const FORMAS_DE_PAGAMENTO = ['PIX', 'TED', 'Boleto', 'Transferência entre contas', 'Cheque', 'Outro'] as const;

const statusIcon = (s: string) => {
    if (s === 'liquidado') return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    if (s === 'pendente') return <Clock className="w-4 h-4 text-blue-600" />;
    if (s === 'atrasado') return <AlertCircle className="w-4 h-4 text-red-600" />;
    if (s === 'cancelado') return <XCircle className="w-4 h-4 text-gray-400" />;
    return null;
};

const emptyForm = (): Partial<InvestorContribution> => ({
    type: 'aporte',
    amount: 0,
    status: 'pendente',
    due_date: '',
    paid_date: '',
    payment_method: '',
    description: '',
});

const ContributionsManager: React.FC<Props> = ({ organizationId, projectId, projectName, investorId, onClose }) => {
    const [items, setItems] = React.useState<InvestorContribution[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [form, setForm] = React.useState<Partial<InvestorContribution>>(emptyForm());
    const [saving, setSaving] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    // Fase C4: o comprovante mora na pasta do investidor no bucket privado (`reports/<org>/comprovantes/…`), o
    // mesmo layout que portal-documentos-download confere para o link do investidor.
    const [comprovante, setComprovante] = React.useState<File | null>(null);

    const load = React.useCallback(() => {
        setLoading(true);
        investorContributionsService.listContributions(projectId, investorId)
            .then(setItems)
            .catch(err => console.error('Error loading contributions', err))
            .finally(() => setLoading(false));
    }, [projectId, investorId]);

    React.useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!form.amount || form.amount <= 0) { setErro('Informe um valor maior que zero.'); return; }
        // Fase C5: a data do pagamento é a real, não o vencimento — sem ela, liquidado não entra em ano nenhum.
        if (form.status === 'liquidado' && !form.paid_date) { setErro('Informe a data do pagamento.'); return; }
        setErro(null);
        setSaving(true);
        try {
            let receiptUrl: string | null = null;
            if (comprovante) {
                const nome = comprovante.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
                receiptUrl = `reports/${organizationId}/comprovantes/${investorId}/${Date.now()}_${nome}`;
                await storageService.uploadFile('documents', receiptUrl, comprovante);
            }
            await investorContributionsService.saveContribution({
                organization_id: organizationId,
                project_id: projectId,
                investor_id: investorId,
                type: form.type as ContributionType,
                amount: Number(form.amount),
                status: form.status as ContributionStatus,
                due_date: form.due_date || null,
                paid_date: form.status === 'liquidado' ? (form.paid_date || null) : null,
                payment_method: form.payment_method || null,
                receipt_url: receiptUrl,
                description: form.description,
            });
            setForm(emptyForm());
            setComprovante(null);
            load();
        } catch (err) {
            console.error('Error saving contribution', err);
            setErro('Erro ao salvar a movimentação.');
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
                    <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
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
                            <MoneyCentsInput
                                value={form.amount || ''}
                                onChange={v => setForm(f => ({ ...f, amount: v === '' ? 0 : Number(v) }))}
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
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-slate-500">Pago em</span>
                            <input
                                type="date"
                                aria-label="Data do pagamento"
                                value={form.paid_date || ''}
                                disabled={form.status !== 'liquidado'}
                                title={form.status !== 'liquidado' ? 'Só para movimentação liquidada.' : undefined}
                                onChange={e => setForm(f => ({ ...f, paid_date: e.target.value }))}
                                className="px-2 h-9 border border-gray-200 rounded-[6px] text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold text-slate-500">Forma</span>
                            <select
                                aria-label="Forma de pagamento"
                                value={form.payment_method || ''}
                                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                                className="px-2 h-9 border border-gray-200 rounded-[6px] text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">—</option>
                                {FORMAS_DE_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </label>
                        <Button
                            onClick={handleAdd}
                            disabled={saving}
                            variant="primary"
                            size="sm"
                        >
                            <Plus className="w-4 h-4" /> Adicionar
                        </Button>
                    </div>
                    <input
                        type="text"
                        value={form.description || ''}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className="mt-3 w-full px-3 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Descrição (opcional) — ex: Cota de investimento Jan/26"
                    />
                    <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-xs font-semibold text-slate-500">Comprovante</span>
                        <input
                            type="file"
                            accept="application/pdf,image/*"
                            aria-label="Comprovante"
                            onChange={e => setComprovante(e.target.files?.[0] ?? null)}
                            className="text-sm"
                        />
                    </label>
                    {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
                    ) : items.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">Nenhuma movimentação registrada.</div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-white sticky top-0">
                                <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    <th className="px-6 py-3">Descrição</th>
                                    <th className="px-6 py-3">Tipo</th>
                                    <th className="px-6 py-3">Vencimento</th>
                                    <th className="px-6 py-3">Pago em</th>
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
                                        <td className="px-6 py-3 text-table-body text-gray-500">
                                            {item.status !== 'liquidado' ? '—'
                                                : item.paid_date ? new Date(item.paid_date + 'T00:00:00').toLocaleDateString('pt-BR')
                                                    : <span title="Sem a data real do pagamento: fica fora do informe de rendimentos.">Data não informada</span>}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(Number(item.amount))}</td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center justify-center">{statusIcon(item.status)}</div>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            {item.receipt_url && (
                                                <ActionIconButton kind="download" title="Baixar comprovante" onClick={() => void abrirArquivoAssinado(BUCKET_DOCUMENTOS, item.receipt_url)} />
                                            )}
                                            <ActionIconButton kind="delete" className="opacity-0 group-hover:opacity-100" onClick={() => handleDelete(item.id!)} />
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
