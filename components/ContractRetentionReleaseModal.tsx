import React from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { Contract, ContractRetentionLedger, RetentionReleaseKind } from '../types';
import { contractService } from '../services/contractService';
import { fmtBRL } from '../utils/format';

interface ContractRetentionReleaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    ledger: ContractRetentionLedger | null;
    onSuccess: () => void;
}

const ContractRetentionReleaseModal: React.FC<ContractRetentionReleaseModalProps> = ({ isOpen, onClose, contract, ledger, onSuccess }) => {
    const [kind, setKind] = React.useState<RetentionReleaseKind>('PROVISORIO');
    const [amount, setAmount] = React.useState<string>('');
    const [notes, setNotes] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setKind('PROVISORIO');
        setAmount('');
        setNotes('');
        setError(null);
    }, [isOpen]);

    const balance = ledger?.balance ?? 0;

    const handleSuggestPercent = (pct: number) => {
        setAmount(((balance * pct) / 100).toFixed(2).replace('.', ','));
    };

    const handleSave = async () => {
        setError(null);
        const amountNum = parseFloat(amount.replace(',', '.'));
        if (isNaN(amountNum) || amountNum <= 0) { setError('Informe um valor válido a liberar.'); return; }

        setSaving(true);
        try {
            await contractService.releaseRetention({
                organization_id: contract.organization_id,
                contract_id: contract.id,
                kind,
                amount: amountNum,
                notes: notes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao liberar retenção.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Liberar Retenção</SheetTitle>
                <SheetDescription>{contract.title} — saldo retido disponível: {fmtBRL(balance)}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Marco</label>
                    <select
                        value={kind}
                        onChange={e => setKind(e.target.value as RetentionReleaseKind)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                    >
                        <option value="PROVISORIO">Recebimento Provisório ({contract.retention_release_provisional ?? 50}%)</option>
                        <option value="DEFINITIVO">Recebimento Definitivo ({contract.retention_release_definitive ?? 50}%)</option>
                        <option value="MANUAL">Liberação Manual</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Valor a Liberar (R$)</label>
                    <input type="text" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => handleSuggestPercent(50)} className="text-xs font-medium text-blue-600 hover:text-blue-800">50% do saldo</button>
                        <span className="text-gray-200">|</span>
                        <button type="button" onClick={() => handleSuggestPercent(100)} className="text-xs font-medium text-blue-600 hover:text-blue-800">100% do saldo</button>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Observações</label>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-none" />
                </div>
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Liberar
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractRetentionReleaseModal;
