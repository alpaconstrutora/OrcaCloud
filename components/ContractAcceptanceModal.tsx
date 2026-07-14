import React from 'react';
import { Save, Loader2, Plus, X } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { Contract, AcceptanceKind, AcceptancePendingItem } from '../types';
import { contractAcceptanceService } from '../services/contractAcceptanceService';

interface ContractAcceptanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    defaultKind: AcceptanceKind;
}

const ContractAcceptanceModal: React.FC<ContractAcceptanceModalProps> = ({ isOpen, onClose, contract, onSuccess, defaultKind }) => {
    const [kind, setKind] = React.useState<AcceptanceKind>(defaultKind);
    const [pendingItems, setPendingItems] = React.useState<AcceptancePendingItem[]>([]);
    const [notes, setNotes] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setKind(defaultKind);
        setPendingItems([]);
        setNotes('');
        setError(null);
    }, [isOpen, defaultKind]);

    const addPendingItem = () => setPendingItems(prev => [...prev, { description: '', deadline: '', responsible: '' }]);
    const updatePendingItem = (idx: number, patch: Partial<AcceptancePendingItem>) =>
        setPendingItems(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
    const removePendingItem = (idx: number) => setPendingItems(prev => prev.filter((_, i) => i !== idx));

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await contractAcceptanceService.issue({
                organization_id: contract.organization_id,
                contract_id: contract.id,
                kind,
                pending_items: pendingItems.filter(p => p.description.trim()),
                notes: notes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao emitir termo de recebimento.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{kind === 'DEFINITIVO' ? 'Recebimento Definitivo' : 'Recebimento Provisório'}</SheetTitle>
                <SheetDescription>{contract.title} — Cl.21, Manual §18</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                {kind === 'DEFINITIVO' && (
                    <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
                        O recebimento definitivo move o contrato para "Concluído". Libere a retenção definitiva
                        separadamente na aba Financeiro, se aplicável.
                    </div>
                )}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Lista de Pendências</label>
                        <button type="button" onClick={addPendingItem} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Adicionar
                        </button>
                    </div>
                    {pendingItems.length === 0 ? (
                        <p className="text-xs text-gray-400">Nenhuma pendência — vistoria sem ressalvas.</p>
                    ) : (
                        <div className="space-y-2">
                            {pendingItems.map((item, idx) => (
                                <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-2 relative">
                                    <button type="button" onClick={() => removePendingItem(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                    <input type="text" placeholder="Descrição da pendência" value={item.description}
                                        onChange={e => updatePendingItem(idx, { description: e.target.value })}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="date" value={item.deadline || ''} onChange={e => updatePendingItem(idx, { deadline: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                                        <input type="text" placeholder="Responsável" value={item.responsible || ''} onChange={e => updatePendingItem(idx, { responsible: e.target.value })}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
                    Emitir Termo
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractAcceptanceModal;
