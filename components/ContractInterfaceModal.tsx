import React from 'react';
import { Save, Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { Contract, ContractInterface } from '../types';
import { contractSupplyMatrixService } from '../services/contractSupplyMatrixService';

interface ContractInterfaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractInterface | null;
}

const ContractInterfaceModal: React.FC<ContractInterfaceModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const [interfaceEvent, setInterfaceEvent] = React.useState(initialData?.interface_event || '');
    const [primaryResponsible, setPrimaryResponsible] = React.useState(initialData?.primary_responsible || '');
    const [support, setSupport] = React.useState(initialData?.support || '');
    const [deadlineTrigger, setDeadlineTrigger] = React.useState(initialData?.deadline_trigger || '');
    const [evidence, setEvidence] = React.useState(initialData?.evidence || '');
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const confirm = useConfirm();

    React.useEffect(() => {
        if (!isOpen) return;
        setInterfaceEvent(initialData?.interface_event || '');
        setPrimaryResponsible(initialData?.primary_responsible || '');
        setSupport(initialData?.support || '');
        setDeadlineTrigger(initialData?.deadline_trigger || '');
        setEvidence(initialData?.evidence || '');
        setError(null);
    }, [isOpen, initialData]);

    const handleSave = async () => {
        setError(null);
        if (!interfaceEvent.trim()) { setError('Informe a interface/evento.'); return; }
        setSaving(true);
        try {
            await contractSupplyMatrixService.saveInterface({
                id: initialData?.id,
                organization_id: contract.organization_id,
                contract_id: contract.id,
                interface_event: interfaceEvent.trim(),
                primary_responsible: primaryResponsible || undefined,
                support: support || undefined,
                deadline_trigger: deadlineTrigger || undefined,
                evidence: evidence || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar interface.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData) return;
        const ok = await confirm({ title: 'Excluir interface?', message: initialData.interface_event, variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
        setDeleting(true);
        try {
            await contractSupplyMatrixService.removeInterface(initialData.id);
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
                <SheetTitle>{initialData ? 'Editar Interface' : 'Nova Interface'}</SheetTitle>
                <SheetDescription>{contract.title} — Anexo I</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Interface / Evento</label>
                    <input type="text" placeholder="Ex: Liberação de frente, Projeto/revisão, Material crítico…" value={interfaceEvent} onChange={e => setInterfaceEvent(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Responsável Primário</label>
                        <input type="text" value={primaryResponsible} onChange={e => setPrimaryResponsible(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Apoio</label>
                        <input type="text" value={support} onChange={e => setSupport(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Prazo / Gatilho</label>
                    <input type="text" placeholder="Ex: D-5 antes da mobilização" value={deadlineTrigger} onChange={e => setDeadlineTrigger(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Evidência Esperada</label>
                    <input type="text" value={evidence} onChange={e => setEvidence(e.target.value)}
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

export default ContractInterfaceModal;
