import React from 'react';
import { Save, Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { Contract, ContractDocumentRequirement, DocumentRequirementPhase } from '../types';
import { contractService } from '../services/contractService';

const PHASE_LABELS: Record<DocumentRequirementPhase, string> = {
    ANTES_INICIO: 'Antes do Início',
    MENSAL: 'Mensal',
    ENCERRAMENTO: 'Encerramento',
};

interface ContractDocumentRequirementModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractDocumentRequirement | null;
}

const ContractDocumentRequirementModal: React.FC<ContractDocumentRequirementModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const [document, setDocument] = React.useState(initialData?.document || '');
    const [phase, setPhase] = React.useState<DocumentRequirementPhase>(initialData?.phase || 'MENSAL');
    const [lastValidUntil, setLastValidUntil] = React.useState(initialData?.last_valid_until || '');
    const [blocksPayment, setBlocksPayment] = React.useState(initialData?.blocks_payment ?? true);
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const confirm = useConfirm();

    React.useEffect(() => {
        if (!isOpen) return;
        setDocument(initialData?.document || '');
        setPhase(initialData?.phase || 'MENSAL');
        setLastValidUntil(initialData?.last_valid_until || '');
        setBlocksPayment(initialData?.blocks_payment ?? true);
        setError(null);
    }, [isOpen, initialData]);

    const handleSave = async () => {
        setError(null);
        if (!document.trim()) { setError('Informe o nome do documento.'); return; }
        setSaving(true);
        try {
            await contractService.saveDocumentRequirement({
                id: initialData?.id,
                organization_id: contract.organization_id,
                contract_id: contract.id,
                document: document.trim(),
                phase,
                last_valid_until: lastValidUntil || undefined,
                blocks_payment: blocksPayment,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar documento.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData) return;
        const ok = await confirm({ title: 'Excluir documento?', message: initialData.document, variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
        setDeleting(true);
        try {
            await contractService.removeDocumentRequirement(initialData.id);
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao excluir documento.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{initialData ? 'Editar Documento' : 'Novo Documento'}</SheetTitle>
                <SheetDescription>{contract.title} — Anexo V</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Documento</label>
                    <input type="text" placeholder="Ex: CND, FGTS, ART/RRT, Apólice…" value={document} onChange={e => setDocument(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Fase Exigida</label>
                    <select value={phase} onChange={e => setPhase(e.target.value as DocumentRequirementPhase)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500">
                        {(Object.keys(PHASE_LABELS) as DocumentRequirementPhase[]).map(p => (
                            <option key={p} value={p}>{PHASE_LABELS[p]}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Validade do Último Envio</label>
                    <input type="date" value={lastValidUntil} onChange={e => setLastValidUntil(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl cursor-pointer">
                    <input type="checkbox" checked={blocksPayment} onChange={e => setBlocksPayment(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm text-gray-700">Bloqueia pagamento quando vencido</span>
                </label>
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

export default ContractDocumentRequirementModal;
