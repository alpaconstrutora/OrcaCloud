import React from 'react';
import { Save, Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { Contract, ContractSupplyMatrixItem } from '../types';
import { contractSupplyMatrixService } from '../services/contractSupplyMatrixService';

interface ContractSupplyMatrixModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractSupplyMatrixItem | null;
}

const ContractSupplyMatrixModal: React.FC<ContractSupplyMatrixModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const [item, setItem] = React.useState(initialData?.item || '');
    const [supplies, setSupplies] = React.useState(initialData?.supplies || '');
    const [transports, setTransports] = React.useState(initialData?.transports || '');
    const [stores, setStores] = React.useState(initialData?.stores || '');
    const [installs, setInstalls] = React.useState(initialData?.installs || '');
    const [admissibleLoss, setAdmissibleLoss] = React.useState(initialData?.admissible_loss || '');
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const confirm = useConfirm();

    React.useEffect(() => {
        if (!isOpen) return;
        setItem(initialData?.item || '');
        setSupplies(initialData?.supplies || '');
        setTransports(initialData?.transports || '');
        setStores(initialData?.stores || '');
        setInstalls(initialData?.installs || '');
        setAdmissibleLoss(initialData?.admissible_loss || '');
        setError(null);
    }, [isOpen, initialData]);

    const handleSave = async () => {
        setError(null);
        if (!item.trim()) { setError('Informe o item.'); return; }
        setSaving(true);
        try {
            await contractSupplyMatrixService.saveItem({
                id: initialData?.id,
                organization_id: contract.organization_id,
                contract_id: contract.id,
                item: item.trim(),
                supplies: supplies || undefined,
                transports: transports || undefined,
                stores: stores || undefined,
                installs: installs || undefined,
                admissible_loss: admissibleLoss || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar item.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData) return;
        const ok = await confirm({ title: 'Excluir item da matriz?', message: initialData.item, variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
        setDeleting(true);
        try {
            await contractSupplyMatrixService.removeItem(initialData.id);
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao excluir.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{initialData ? 'Editar Item da Matriz' : 'Novo Item da Matriz'}</SheetTitle>
                <SheetDescription>{contract.title} — Anexo II, Cl.11</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Item</label>
                    <input type="text" placeholder="Ex: Materiais incorporados, Consumíveis, EPIs…" value={item} onChange={e => setItem(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Fornece</label>
                        <input type="text" placeholder="ALPA / CONTRATADO" value={supplies} onChange={e => setSupplies(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Transporta/Descarga</label>
                        <input type="text" value={transports} onChange={e => setTransports(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Guarda</label>
                        <input type="text" value={stores} onChange={e => setStores(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Instala/Usa</label>
                        <input type="text" value={installs} onChange={e => setInstalls(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Perda Admissível / Observação</label>
                    <input type="text" value={admissibleLoss} onChange={e => setAdmissibleLoss(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
            </SheetPanel>
            <SheetFooter>
                {initialData && (
                    <Button variant="ghost" onClick={handleDelete} disabled={deleting || saving} className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700">
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Excluir
                    </Button>
                )}
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving || deleting}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {initialData ? 'Salvar' : 'Adicionar'}
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractSupplyMatrixModal;
