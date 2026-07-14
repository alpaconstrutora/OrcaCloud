import React from 'react';
import { Save, Loader2, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { Contract, ContractTechnicalResponsibility, TechnicalCouncil, ArtType, TechnicalResponsibilityStatus } from '../types';
import { contractTechnicalResponsibilityService } from '../services/contractTechnicalResponsibilityService';

interface ContractTechnicalResponsibilityModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractTechnicalResponsibility | null;
}

const ContractTechnicalResponsibilityModal: React.FC<ContractTechnicalResponsibilityModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const [professionalName, setProfessionalName] = React.useState(initialData?.professional_name || '');
    const [council, setCouncil] = React.useState<TechnicalCouncil | ''>(initialData?.council || '');
    const [councilNumber, setCouncilNumber] = React.useState(initialData?.council_number || '');
    const [artType, setArtType] = React.useState<ArtType>(initialData?.art_type || 'ART');
    const [artNumber, setArtNumber] = React.useState(initialData?.art_number || '');
    const [validFrom, setValidFrom] = React.useState(initialData?.valid_from || '');
    const [validUntil, setValidUntil] = React.useState(initialData?.valid_until || '');
    const [status, setStatus] = React.useState<TechnicalResponsibilityStatus>(initialData?.status || 'VALIDA');
    const [saving, setSaving] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const confirm = useConfirm();

    React.useEffect(() => {
        if (!isOpen) return;
        setProfessionalName(initialData?.professional_name || '');
        setCouncil(initialData?.council || '');
        setCouncilNumber(initialData?.council_number || '');
        setArtType(initialData?.art_type || 'ART');
        setArtNumber(initialData?.art_number || '');
        setValidFrom(initialData?.valid_from || '');
        setValidUntil(initialData?.valid_until || '');
        setStatus(initialData?.status || 'VALIDA');
        setError(null);
    }, [isOpen, initialData]);

    const handleSave = async () => {
        setError(null);
        if (!professionalName.trim()) { setError('Informe o nome do profissional.'); return; }
        setSaving(true);
        try {
            await contractTechnicalResponsibilityService.save({
                id: initialData?.id,
                organization_id: contract.organization_id,
                contract_id: contract.id,
                professional_name: professionalName.trim(),
                council: council || undefined,
                council_number: councilNumber || undefined,
                art_type: artType,
                art_number: artNumber || undefined,
                valid_from: validFrom || undefined,
                valid_until: validUntil || undefined,
                status,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar responsabilidade técnica.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData) return;
        const ok = await confirm({ title: 'Excluir responsabilidade técnica?', message: initialData.professional_name, variant: 'danger', confirmLabel: 'Excluir' });
        if (!ok) return;
        setDeleting(true);
        try {
            await contractTechnicalResponsibilityService.remove(initialData.id);
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
                <SheetTitle>{initialData ? 'Editar Responsabilidade Técnica' : 'Nova Responsabilidade Técnica'}</SheetTitle>
                <SheetDescription>{contract.title} — Cl.10, Anexo E</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="space-y-2">
                    <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Profissional</label>
                    <input type="text" value={professionalName} onChange={e => setProfessionalName(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Conselho</label>
                        <select value={council} onChange={e => setCouncil(e.target.value as TechnicalCouncil | '')}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500">
                            <option value="">—</option>
                            <option value="CREA">CREA</option>
                            <option value="CAU">CAU</option>
                            <option value="CRT">CRT</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Nº do Registro</label>
                        <input type="text" value={councilNumber} onChange={e => setCouncilNumber(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Tipo</label>
                        <select value={artType} onChange={e => setArtType(e.target.value as ArtType)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500">
                            <option value="ART">ART</option>
                            <option value="RRT">RRT</option>
                            <option value="TRT">TRT</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Nº do Documento</label>
                        <input type="text" value={artNumber} onChange={e => setArtNumber(e.target.value)}
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
                    <select value={status} onChange={e => setStatus(e.target.value as TechnicalResponsibilityStatus)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500">
                        <option value="VALIDA">Válida</option>
                        <option value="SUSPENSA">Suspensa</option>
                        <option value="CANCELADA">Cancelada</option>
                        <option value="BAIXADA">Baixada</option>
                    </select>
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

export default ContractTechnicalResponsibilityModal;
