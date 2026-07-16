import React from 'react';
import { Plus, ChevronDown, ChevronUp, Ban, CircleDollarSign } from 'lucide-react';
import { formatCurrency } from '../../utils/financialMath';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import Button from '../ui/Button';
import { useConfirm } from '../ui/confirm';
import { SpePartner } from '../../services/speService';
import {
    capitalCallService, CapitalCall, CapitalCallItem,
    CAPITAL_CALL_STATUS_LABELS, CAPITAL_CALL_ITEM_STATUS_LABELS,
} from '../../services/capitalCallService';

interface Props {
    organizationId: string;
    speEntityId: string;
    partners: SpePartner[];
    isAdmin?: boolean;
    userEmail?: string;
}

const emptyCallForm = (organizationId: string, speEntityId: string) => ({
    organization_id: organizationId,
    spe_entity_id: speEntityId,
    title: '',
    description: '',
    total_amount: 0,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
});

const CapitalCallPanel: React.FC<Props> = ({ organizationId, speEntityId, partners, isAdmin, userEmail }) => {
    const confirm = useConfirm();
    const [calls, setCalls] = React.useState<CapitalCall[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [expanded, setExpanded] = React.useState<string | null>(null);
    const [items, setItems] = React.useState<Record<string, CapitalCallItem[]>>({});
    const [showNewCall, setShowNewCall] = React.useState(false);
    const [callForm, setCallForm] = React.useState(emptyCallForm(organizationId, speEntityId));
    const [rateio, setRateio] = React.useState<Record<string, number>>({});
    const [saving, setSaving] = React.useState(false);
    const [paymentInput, setPaymentInput] = React.useState<Record<string, number>>({});

    const load = React.useCallback(() => {
        setLoading(true);
        capitalCallService.listCalls(speEntityId)
            .then(setCalls)
            .catch(err => console.error('Erro ao carregar chamadas de capital', err))
            .finally(() => setLoading(false));
    }, [speEntityId]);

    React.useEffect(() => { load(); }, [load]);

    const loadItems = async (callId: string) => {
        const list = await capitalCallService.listItems(callId);
        setItems(prev => ({ ...prev, [callId]: list }));
    };

    const handleExpand = async (id: string) => {
        const next = expanded === id ? null : id;
        setExpanded(next);
        if (next) await loadItems(next);
    };

    /** Rateia o valor total proporcionalmente à participação de cada sócio */
    const applyProportionalRateio = (total: number) => {
        const next: Record<string, number> = {};
        partners.forEach(p => { next[p.id!] = Math.round((total * (Number(p.ownership_pct) / 100)) * 100) / 100; });
        setRateio(next);
    };

    const handleSaveCall = async () => {
        if (!callForm.title.trim() || !callForm.due_date || callForm.total_amount <= 0) {
            alert('Preencha título, prazo e valor total.');
            return;
        }
        const rateioSum = Object.values(rateio).reduce((a, b) => a + b, 0);
        if (Math.abs(rateioSum - callForm.total_amount) > 0.05) {
            alert(`O rateio (${formatCurrency(rateioSum)}) deve somar o valor total da chamada (${formatCurrency(callForm.total_amount)}).`);
            return;
        }
        setSaving(true);
        try {
            await capitalCallService.createCall(
                { ...callForm, created_by_email: userEmail },
                Object.entries(rateio).filter(([, v]) => v > 0).map(([spe_partner_id, amount_due]) => ({ spe_partner_id, amount_due })),
            );
            setShowNewCall(false);
            setCallForm(emptyCallForm(organizationId, speEntityId));
            setRateio({});
            load();
        } catch (err) {
            console.error('Erro ao emitir chamada de capital', err);
            alert('Erro ao emitir chamada. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleCancelCall = async (call: CapitalCall) => {
        if (!call.id) return;
        const ok = await confirm({ title: 'Cancelar chamada de capital?', message: call.title, variant: 'danger' });
        if (!ok) return;
        await capitalCallService.cancelCall(call.id);
        load();
    };

    const handleRegisterPayment = async (item: CapitalCallItem, callId: string) => {
        const amount = paymentInput[item.id!];
        if (!amount || amount <= 0) { alert('Informe um valor.'); return; }
        try {
            await capitalCallService.registerPayment(item, amount);
            await loadItems(callId);
            load();
            setPaymentInput(prev => ({ ...prev, [item.id!]: 0 }));
        } catch (err) {
            console.error('Erro ao registrar pagamento', err);
            alert('Erro ao registrar pagamento.');
        }
    };

    if (loading) return <p className="text-xs text-gray-400 text-center py-4">Carregando chamadas de capital...</p>;

    return (
        <div className="pt-4 border-t border-gray-50 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Chamadas de Capital</p>
                {isAdmin && (
                    <Button size="sm" onClick={() => { setShowNewCall(true); applyProportionalRateio(callForm.total_amount); }} className="flex items-center gap-1 rounded-lg text-button">
                        <Plus className="w-4 h-4" /> Nova Chamada
                    </Button>
                )}
            </div>

            {calls.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">Nenhuma chamada de capital emitida.</p>
            ) : (
                <div className="space-y-2">
                    {calls.map(call => {
                        const isOpen = expanded === call.id;
                        const callItems = items[call.id!] || [];
                        return (
                            <div key={call.id} className="border border-gray-100 rounded-xl overflow-hidden">
                                <div className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50/50" onClick={() => handleExpand(call.id!)}>
                                    <CircleDollarSign className="w-4 h-4 text-blue-600 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{call.title}</p>
                                        <p className="text-xs text-gray-400">
                                            {formatCurrency(call.total_amount)} — vencimento {new Date(call.due_date + 'T00:00:00').toLocaleDateString('pt-BR')} — {CAPITAL_CALL_STATUS_LABELS[call.status]}
                                        </p>
                                    </div>
                                    {isAdmin && call.status !== 'cancelada' && call.status !== 'paga' && (
                                        <button onClick={e => { e.stopPropagation(); handleCancelCall(call); }} className="p-1.5 hover:bg-red-50 rounded-lg">
                                            <Ban className="w-3.5 h-3.5 text-red-500" />
                                        </button>
                                    )}
                                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                </div>
                                {isOpen && (
                                    <div className="border-t border-gray-50 p-3">
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                                    <th className="pb-2">Sócio</th>
                                                    <th className="pb-2 text-right">Devido</th>
                                                    <th className="pb-2 text-right">Pago</th>
                                                    <th className="pb-2 text-right">Status</th>
                                                    {isAdmin && <th className="pb-2 text-right">Registrar</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {callItems.map(item => (
                                                    <tr key={item.id}>
                                                        <td className="py-2 font-medium text-gray-800">{item.investor_name || '—'}</td>
                                                        <td className="py-2 text-right text-gray-700">{formatCurrency(item.amount_due)}</td>
                                                        <td className="py-2 text-right text-emerald-700 font-medium">{formatCurrency(item.amount_paid)}</td>
                                                        <td className="py-2 text-right text-gray-600">{CAPITAL_CALL_ITEM_STATUS_LABELS[item.status]}</td>
                                                        {isAdmin && (
                                                            <td className="py-2 text-right">
                                                                {item.status !== 'pago' && (
                                                                    <div className="flex items-center justify-end gap-1">
                                                                        <input type="number" min="0" step="0.01"
                                                                            value={paymentInput[item.id!] || ''}
                                                                            onChange={e => setPaymentInput(p => ({ ...p, [item.id!]: parseFloat(e.target.value) || 0 }))}
                                                                            className="w-24 px-2 py-1 border border-gray-200 rounded text-form-input"
                                                                            placeholder="0,00"
                                                                        />
                                                                        <Button size="sm" onClick={() => handleRegisterPayment(item, call.id!)} className="rounded text-button">Pagar</Button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal open={showNewCall} onClose={() => setShowNewCall(false)} size="lg">
                <ModalHeader title="Nova Chamada de Capital" onClose={() => setShowNewCall(false)} />
                <ModalBody className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Título *</label>
                            <input type="text" value={callForm.title} onChange={e => setCallForm({ ...callForm, title: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" placeholder="Ex: Chamada 1 — Aquisição do terreno" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Valor total (R$) *</label>
                            <input type="number" min="0" step="0.01" value={callForm.total_amount || ''}
                                onChange={e => {
                                    const total = parseFloat(e.target.value) || 0;
                                    setCallForm({ ...callForm, total_amount: total });
                                    applyProportionalRateio(total);
                                }}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Data de emissão</label>
                            <input type="date" value={callForm.issue_date} onChange={e => setCallForm({ ...callForm, issue_date: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Vencimento *</label>
                            <input type="date" value={callForm.due_date} onChange={e => setCallForm({ ...callForm, due_date: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Descrição</label>
                        <textarea rows={2} value={callForm.description} onChange={e => setCallForm({ ...callForm, description: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-600 mb-1.5">Rateio por sócio (proporcional à participação — editável)</p>
                        <div className="space-y-2">
                            {partners.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-gray-700 flex-1 truncate">{p.investor_name} <span className="text-xs text-gray-400">({Number(p.ownership_pct).toFixed(2)}%)</span></span>
                                    <input type="number" min="0" step="0.01"
                                        value={rateio[p.id!] ?? ''}
                                        onChange={e => setRateio(r => ({ ...r, [p.id!]: parseFloat(e.target.value) || 0 }))}
                                        className="w-32 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2 text-right">
                            Soma do rateio: {formatCurrency(Object.values(rateio).reduce((a, b) => a + b, 0))}
                        </p>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setShowNewCall(false)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSaveCall} disabled={saving}>
                        {saving ? 'Emitindo...' : 'Emitir chamada'}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};

export default CapitalCallPanel;
