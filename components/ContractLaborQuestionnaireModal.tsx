import React from 'react';
import { Save, Loader2, Upload } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { Contract, ContractLaborQuestionnaire } from '../types';
import { contractLaborQuestionnaireService, LaborQuestionnaireAnswers, LABOR_ALERT_THRESHOLD } from '../services/contractLaborQuestionnaireService';
import { storageService } from '../services/storageService';
import { sanitizeFileName } from '../utils/storageUtils';

type QuestionKey = keyof LaborQuestionnaireAnswers;

const QUESTIONS: { key: QuestionKey; label: string }[] = [
    { key: 'q_horario', label: 'A pessoa deverá trabalhar todos os dias em horário definido pela ALPA?' },
    { key: 'q_ordens', label: 'Receberá ordens diretas contínuas de gestor da ALPA?' },
    { key: 'q_pessoalidade', label: 'A prestação depende pessoalmente de uma pessoa específica?' },
    { key: 'q_salario_fixo', label: 'Haverá pagamento mensal fixo semelhante a salário?' },
    { key: 'q_permanente', label: 'A atividade é permanente e integrada à operação da ALPA?' },
    { key: 'q_exclusividade', label: 'A pessoa não tem outros clientes e haverá exclusividade prática?' },
    { key: 'q_cargo_email', label: 'Usará cargo, e-mail, uniforme ou organograma como empregado ALPA?' },
    { key: 'q_ferias', label: 'Férias, folgas ou jornada serão aprovadas pela ALPA?' },
];

interface ContractLaborQuestionnaireModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractLaborQuestionnaire | null;
}

const ContractLaborQuestionnaireModal: React.FC<ContractLaborQuestionnaireModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const buildInitial = (): LaborQuestionnaireAnswers => ({
        q_horario: initialData?.q_horario ?? false,
        q_ordens: initialData?.q_ordens ?? false,
        q_pessoalidade: initialData?.q_pessoalidade ?? false,
        q_salario_fixo: initialData?.q_salario_fixo ?? false,
        q_permanente: initialData?.q_permanente ?? false,
        q_exclusividade: initialData?.q_exclusividade ?? false,
        q_cargo_email: initialData?.q_cargo_email ?? false,
        q_ferias: initialData?.q_ferias ?? false,
    });
    const [answers, setAnswers] = React.useState<LaborQuestionnaireAnswers>(buildInitial());
    const [legalOpinionUrl, setLegalOpinionUrl] = React.useState(initialData?.legal_opinion_url || '');
    const [saving, setSaving] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setAnswers(buildInitial());
        setLegalOpinionUrl(initialData?.legal_opinion_url || '');
        setError(null);
    }, [isOpen, initialData]);

    const alertCount = Object.values(answers).filter(Boolean).length;
    const blocked = alertCount >= LABOR_ALERT_THRESHOLD && !legalOpinionUrl;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const cleanName = sanitizeFileName(file.name);
            const path = `${contract.organization_id}/contracts/${contract.id}/parecer_juridico_${Date.now()}_${cleanName}`;
            await storageService.uploadFile('documents', path, file);
            setLegalOpinionUrl(storageService.getPublicUrl('documents', path));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao enviar parecer jurídico.');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await contractLaborQuestionnaireService.answer({
                organization_id: contract.organization_id,
                contract_id: contract.id,
                ...answers,
                legal_opinion_url: legalOpinionUrl || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar questionário.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Questionário de Risco Trabalhista</SheetTitle>
                <SheetDescription>{contract.title} — Manual Interno §8, Anexo H</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Alertas</span>
                    <span className={`text-lg font-semibold ${alertCount >= LABOR_ALERT_THRESHOLD ? 'text-red-600' : 'text-emerald-600'}`}>{alertCount}</span>
                </div>
                <div className="space-y-3">
                    {QUESTIONS.map(q => (
                        <div key={q.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl gap-4">
                            <span className="text-sm text-gray-700 flex-1">{q.label}</span>
                            <div className="flex bg-white rounded-xl border border-gray-200 p-1 gap-1 shrink-0">
                                {(['Não', 'Sim'] as const).map((label, idx) => {
                                    const value = idx === 1;
                                    return (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() => setAnswers(prev => ({ ...prev, [q.key]: value }))}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                                answers[q.key] === value
                                                    ? (value ? 'bg-amber-500 text-white' : 'bg-gray-700 text-white')
                                                    : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                {alertCount >= LABOR_ALERT_THRESHOLD && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-3">
                        <p className="text-sm text-amber-700">
                            2 ou mais alertas impedem contratação de pessoa física sem parecer jurídico (Manual §8.1).
                            Anexe o parecer para liberar a Ordem de Início.
                        </p>
                        {legalOpinionUrl ? (
                            <p className="text-xs font-medium text-emerald-700">Parecer anexado.</p>
                        ) : (
                            <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-amber-200 rounded-xl text-xs font-medium text-amber-700 cursor-pointer hover:bg-amber-100 transition-all">
                                <Upload className="w-3.5 h-3.5" />
                                {uploading ? 'Enviando…' : 'Anexar parecer jurídico'}
                                <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                            </label>
                        )}
                    </div>
                )}
            </SheetPanel>
            <SheetFooter>
                <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Questionário
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractLaborQuestionnaireModal;
