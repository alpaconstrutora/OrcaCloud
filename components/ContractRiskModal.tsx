import React from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
import Button from './ui/Button';
import { Contract, ContractRiskAssessment, ContractRiskLevel } from '../types';
import { contractRiskService, RiskFactors } from '../services/contractRiskService';

type FactorKey = keyof RiskFactors;

const FACTORS: { key: FactorKey; label: string; options: [string, string, string] }[] = [
    { key: 'factor_canteiro', label: 'Presença no canteiro', options: ['Nenhuma', 'Esporádica', 'Diária/contínua'] },
    { key: 'factor_equipe', label: 'Equipe', options: ['Sem empregados', 'Até 5', 'Mais de 5'] },
    { key: 'factor_sst', label: 'Risco de SST', options: ['Baixo', 'Moderado', 'Crítico'] },
    { key: 'factor_valor', label: 'Valor do contrato', options: ['Até alçada R1', 'Intermediário', 'Acima da alçada R2'] },
    { key: 'factor_tecnica', label: 'Técnica / ART', options: ['Não', 'Apoio', 'Responsabilidade técnica'] },
    { key: 'factor_dados', label: 'Dados / sistemas', options: ['Nenhum', 'Acesso limitado', 'Dados pessoais/sistemas críticos'] },
    { key: 'factor_continuidade', label: 'Continuidade', options: ['Única entrega', 'Recorrente', 'Essencial à operação'] },
    { key: 'factor_pf', label: 'Pessoa física', options: ['Não', 'Profissional intelectual pontual', 'Atividade habitual/integrada'] },
];

const levelOf = (score: number): ContractRiskLevel => (score >= 10 ? 'R3' : score >= 5 ? 'R2' : 'R1');
const LEVEL_COLOR: Record<ContractRiskLevel, string> = { R1: 'text-emerald-600', R2: 'text-amber-600', R3: 'text-red-600' };

interface ContractRiskModalProps {
    isOpen: boolean;
    onClose: () => void;
    contract: Contract;
    onSuccess: () => void;
    initialData?: ContractRiskAssessment | null;
}

const ContractRiskModal: React.FC<ContractRiskModalProps> = ({ isOpen, onClose, contract, onSuccess, initialData }) => {
    const [factors, setFactors] = React.useState<RiskFactors>({
        factor_canteiro: initialData?.factor_canteiro ?? 0,
        factor_equipe: initialData?.factor_equipe ?? 0,
        factor_sst: initialData?.factor_sst ?? 0,
        factor_valor: initialData?.factor_valor ?? 0,
        factor_tecnica: initialData?.factor_tecnica ?? 0,
        factor_dados: initialData?.factor_dados ?? 0,
        factor_continuidade: initialData?.factor_continuidade ?? 0,
        factor_pf: initialData?.factor_pf ?? 0,
    });
    const [notes, setNotes] = React.useState(initialData?.notes || '');
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;
        setFactors({
            factor_canteiro: initialData?.factor_canteiro ?? 0,
            factor_equipe: initialData?.factor_equipe ?? 0,
            factor_sst: initialData?.factor_sst ?? 0,
            factor_valor: initialData?.factor_valor ?? 0,
            factor_tecnica: initialData?.factor_tecnica ?? 0,
            factor_dados: initialData?.factor_dados ?? 0,
            factor_continuidade: initialData?.factor_continuidade ?? 0,
            factor_pf: initialData?.factor_pf ?? 0,
        });
        setNotes(initialData?.notes || '');
        setError(null);
    }, [isOpen, initialData]);

    const score: number = Object.values(factors).reduce((s: number, v) => s + v, 0);
    const level = levelOf(score);
    const pfAlert = factors.factor_pf === 2;

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await contractRiskService.assess({
                organization_id: contract.organization_id,
                contract_id: contract.id,
                ...factors,
                notes: notes || undefined,
            });
            onSuccess();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao salvar avaliação de risco.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Sheet open={isOpen} onClose={onClose} size="lg">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Classificação de Risco da Contratação</SheetTitle>
                <SheetDescription>{contract.title} — Manual Interno §3</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-6 space-y-5">
                {error && (
                    <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{error}</div>
                )}
                <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Pontuação total: {score}</span>
                    <span className={`text-lg font-semibold ${LEVEL_COLOR[level]}`}>{level}</span>
                </div>
                {pfAlert && (
                    <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
                        Pontuação 2 no fator "Pessoa física" exige análise trabalhista e não pode ser aprovada automaticamente (Manual §3.1).
                    </div>
                )}
                <div className="space-y-4">
                    {FACTORS.map(f => (
                        <div key={f.key} className="space-y-2">
                            <label className="text-form-label font-medium text-gray-400 uppercase tracking-widest">{f.label}</label>
                            <div className="flex gap-2">
                                {f.options.map((opt, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setFactors(prev => ({ ...prev, [f.key]: idx as 0 | 1 | 2 }))}
                                        className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-medium transition-all ${
                                            factors[f.key] === idx
                                                ? 'bg-blue-600 border-blue-600 text-white'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                        }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
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
                    Salvar Avaliação
                </Button>
            </SheetFooter>
        </Sheet>
    );
};

export default ContractRiskModal;
