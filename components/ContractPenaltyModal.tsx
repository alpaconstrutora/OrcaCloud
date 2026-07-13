import React from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { Contract, PenaltyKind } from '../types';
import { contractPenaltyService } from '../services/contractPenaltyService';

const KIND_LABELS: Record<PenaltyKind, string> = {
    MORATORIA: 'Moratória (atraso)',
    COMPENSATORIA: 'Compensatória (abandono/inadimplemento)',
    SST: 'Infração de SST/Compliance',
    OUTRA: 'Outra',
};

interface ContractPenaltyModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
}

const ContractPenaltyModal: React.FC<ContractPenaltyModalProps> = ({ isOpen, onClose, contract, onSuccess }) => {
    const [kind, setKind] = React.useState<PenaltyKind>('MORATORIA');
    const [reason, setReason] = React.useState('');
    const [baseValue, setBaseValue] = React.useState<string>('');
    const [amount, setAmount] = React.useState<string>('');
    const [cureDeadline, setCureDeadline] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setKind('MORATORIA');
        setReason('');
        setBaseValue('');
        setAmount('');
        setCureDeadline('');
        setError(null);
    }, [isOpen]);

    const handleSave = async () => {
        setError(null);
        if (!reason.trim()) { setError('Descreva o motivo da penalidade.'); return; }
        const amountNum = parseFloat(amount.replace(',', '.'));
        if (isNaN(amountNum) || amountNum <= 0) { setError('Informe um valor de multa válido.'); return; }

        setSaving(true);
        try {
            await contractPenaltyService.notify({
                organization_id: contract.organization_id,
                contract_id: contract.id,
                kind,
                reason: reason.trim(),
                base_value: baseValue ? parseFloat(baseValue.replace(',', '.')) : undefined,
                amount: amountNum,
                cure_deadline: cureDeadline || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao notificar penalidade.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Notificar Penalidade</SheetTitle>
                <SheetDescription>{contract.title} — abre prazo de cura de 3 dias úteis (Cl.31.1)</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Tipo</label>
                    <select
                        value={kind}
                        onChange={e => setKind(e.target.value as PenaltyKind)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                    >
                        {(Object.keys(KIND_LABELS) as PenaltyKind[]).map(k => (
                            <option key={k} value={k}>{KIND_LABELS[k]}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Motivo</label>
                    <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                        placeholder="Descreva o fato que motiva a penalidade"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Base de Cálculo (R$)</label>
                        <input type="text" placeholder="0,00" value={baseValue} onChange={e => setBaseValue(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Valor da Multa (R$)</label>
                        <input type="text" required placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2 col-span-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Prazo de Cura (padrão: 3 dias úteis)</label>
                        <input type="date" value={cureDeadline} onChange={e => setCureDeadline(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                </div>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Notificar
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractPenaltyModal;
