import React from 'react';
import { Save, Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { Contract, ContractGuarantee, GuaranteeKind, GuaranteeStatus } from '../types';
import { contractGuaranteeService } from '../services/contractGuaranteeService';

// Modalidades de OBRA/suprimentos apenas — locação usa RentalGuaranteePanel,
// que versiona a garantia e aplica as regras da Lei 8.245/91. Editar uma
// garantia de locação por este modal quebraria os invariantes de versão/ativa.
const KIND_LABELS: Partial<Record<GuaranteeKind, string>> = {
    RC_GERAL: 'RC Geral',
    RC_PROFISSIONAL: 'RC Profissional',
    SEGURO_GARANTIA: 'Seguro-Garantia',
    FIANCA: 'Fiança Bancária',
    CAUCAO: 'Caução',
    EQUIPAMENTOS: 'Equipamentos/Veículos',
    AMBIENTAL: 'Riscos Ambientais',
    GARANTIA_ADIANTAMENTO: 'Garantia de Adiantamento',
};

interface ContractGuaranteeModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractGuarantee | null;
}

const ContractGuaranteeModal: React.FC<ContractGuaranteeModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const [kind, setKind] = React.useState<GuaranteeKind>(initialData?.kind || 'RC_GERAL');
    const [insurer, setInsurer] = React.useState(initialData?.insurer || '');
    const [policyNumber, setPolicyNumber] = React.useState(initialData?.policy_number || '');
    const [coverageLimit, setCoverageLimit] = React.useState<string>(initialData?.coverage_limit?.toString() || '');
    const [premium, setPremium] = React.useState<string>(initialData?.premium?.toString() || '');
    const [validFrom, setValidFrom] = React.useState(initialData?.valid_from || '');
    const [validUntil, setValidUntil] = React.useState(initialData?.valid_until || '');
    const [status, setStatus] = React.useState<GuaranteeStatus>(initialData?.status || 'VIGENTE');
    const [notes, setNotes] = React.useState(initialData?.notes || '');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setKind(initialData?.kind || 'RC_GERAL');
        setInsurer(initialData?.insurer || '');
        setPolicyNumber(initialData?.policy_number || '');
        setCoverageLimit(initialData?.coverage_limit?.toString() || '');
        setPremium(initialData?.premium?.toString() || '');
        setValidFrom(initialData?.valid_from || '');
        setValidUntil(initialData?.valid_until || '');
        setStatus(initialData?.status || 'VIGENTE');
        setNotes(initialData?.notes || '');
        setError(null);
    }, [isOpen, initialData]);

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await contractGuaranteeService.save({
                id: initialData?.id,
                organization_id: contract.organization_id,
                contract_id: contract.id,
                kind,
                insurer: insurer || undefined,
                policy_number: policyNumber || undefined,
                coverage_limit: coverageLimit ? parseFloat(coverageLimit.replace(',', '.')) : undefined,
                premium: premium ? parseFloat(premium.replace(',', '.')) : undefined,
                valid_from: validFrom || undefined,
                valid_until: validUntil || undefined,
                status,
                notes: notes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar garantia.');
        } finally {
            setSaving(false);
        }
    };

    const confirm = useConfirm();
    const [deleting, setDeleting] = React.useState(false);
    const handleDelete = async () => {
        if (!initialData) return;
        const ok = await confirm({
            title: 'Excluir seguro/garantia?',
            message: `${KIND_LABELS[initialData.kind] || initialData.kind} — ${initialData.insurer || 'sem seguradora'}. Esta ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        setDeleting(true);
        try {
            await contractGuaranteeService.remove(initialData.id);
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao excluir garantia.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>{initialData ? 'Editar Seguro/Garantia' : 'Novo Seguro/Garantia'}</SheetTitle>
                <SheetDescription>{contract.title}</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Tipo</label>
                    <select
                        value={kind}
                        onChange={e => setKind(e.target.value as GuaranteeKind)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                    >
                        {(Object.keys(KIND_LABELS) as GuaranteeKind[]).map(k => (
                            <option key={k} value={k}>{KIND_LABELS[k]}</option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Seguradora / Instituição</label>
                        <input type="text" value={insurer} onChange={e => setInsurer(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Nº da Apólice</label>
                        <input type="text" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Limite de Cobertura (R$)</label>
                        <input type="text" placeholder="0,00" value={coverageLimit} onChange={e => setCoverageLimit(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Prêmio (R$)</label>
                        <input type="text" placeholder="0,00" value={premium} onChange={e => setPremium(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Vigência — Início</label>
                        <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Vigência — Fim</label>
                        <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Status</label>
                    <select
                        value={status}
                        onChange={e => setStatus(e.target.value as GuaranteeStatus)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                    >
                        <option value="VIGENTE">Vigente</option>
                        <option value="VENCIDA">Vencida</option>
                        <option value="CANCELADA">Cancelada</option>
                        <option value="SUBSTITUIDA">Substituída</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Observações</label>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-none" />
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
                    {initialData ? 'Salvar' : 'Cadastrar'}
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractGuaranteeModal;
