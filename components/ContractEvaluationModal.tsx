import React from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { Contract } from '../types';
import { contractEvaluationService, EvaluationScores } from '../services/contractEvaluationService';

const CRITERIA: { key: keyof Omit<EvaluationScores, 'critical_occurrence'>; label: string; weight: string }[] = [
    { key: 'score_quality', label: 'Qualidade e retrabalho', weight: '25%' },
    { key: 'score_deadline', label: 'Prazo e produtividade', weight: '20%' },
    { key: 'score_sst', label: 'SST e meio ambiente', weight: '20%' },
    { key: 'score_compliance', label: 'Documentação e compliance', weight: '15%' },
    { key: 'score_communication', label: 'Comunicação e planejamento', weight: '10%' },
    { key: 'score_commercial', label: 'Comercial e colaboração', weight: '10%' },
];

const WEIGHTS: Record<string, number> = {
    score_quality: 0.25, score_deadline: 0.20, score_sst: 0.20,
    score_compliance: 0.15, score_communication: 0.10, score_commercial: 0.10,
};

interface ContractEvaluationModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    supplierId?: string;
    onSuccess: () => void;
}

const ContractEvaluationModal: React.FC<ContractEvaluationModalProps> = ({ isOpen, onClose, contract, supplierId, onSuccess }) => {
    const [scores, setScores] = React.useState<Record<string, number>>({
        score_quality: 3, score_deadline: 3, score_sst: 3, score_compliance: 3, score_communication: 3, score_commercial: 3,
    });
    const [criticalOccurrence, setCriticalOccurrence] = React.useState(false);
    const [period, setPeriod] = React.useState(new Date().toISOString().slice(0, 7));
    const [notes, setNotes] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setScores({ score_quality: 3, score_deadline: 3, score_sst: 3, score_compliance: 3, score_communication: 3, score_commercial: 3 });
        setCriticalOccurrence(false);
        setPeriod(new Date().toISOString().slice(0, 7));
        setNotes('');
        setError(null);
    }, [isOpen]);

    const weighted = CRITERIA.reduce((sum, c) => sum + scores[c.key] * WEIGHTS[c.key], 0);

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await contractEvaluationService.save({
                organization_id: contract.organization_id,
                contract_id: contract.id,
                supplier_id: supplierId,
                period,
                score_quality: scores.score_quality,
                score_deadline: scores.score_deadline,
                score_sst: scores.score_sst,
                score_compliance: scores.score_compliance,
                score_communication: scores.score_communication,
                score_commercial: scores.score_commercial,
                critical_occurrence: criticalOccurrence,
                notes: notes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar avaliação.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Avaliação de Desempenho do Prestador</SheetTitle>
                <SheetDescription>{contract.title} — Manual Interno §17</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">Período de Referência</label>
                        <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500" />
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">Nota Ponderada</span>
                        <span className={`text-lg font-semibold ${weighted < 2 ? 'text-red-600' : weighted < 3 ? 'text-amber-600' : 'text-emerald-600'}`}>{weighted.toFixed(2)}</span>
                    </div>
                </div>
                <div className="space-y-4">
                    {CRITERIA.map(c => (
                        <div key={c.key} className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">{c.label}</label>
                                <span className="text-xs text-gray-400">{c.weight}</span>
                            </div>
                            <div className="flex gap-2">
                                {[0, 1, 2, 3, 4, 5].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setScores(prev => ({ ...prev, [c.key]: n }))}
                                        className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                                            scores[c.key] === n ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl cursor-pointer">
                    <input type="checkbox" checked={criticalOccurrence} onChange={e => setCriticalOccurrence(e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm text-gray-700">Ocorrência crítica no período (bloqueia novas contratações — Manual §17.1)</span>
                </label>
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
                    Salvar Avaliação
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractEvaluationModal;
