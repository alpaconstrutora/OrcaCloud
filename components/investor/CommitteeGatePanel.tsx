import React from 'react';
import { Gavel, CheckCircle2, XCircle, RotateCcw, Pause, Archive, Circle, FileDown } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import Button from '../ui/Button';
import {
    investmentCommitteeService, CommitteeDecisionRecord, CommitteeGate, CommitteeDecision,
    COMMITTEE_GATE_LABELS, COMMITTEE_DECISION_LABELS,
} from '../../services/investmentCommitteeService';
import { dueDiligenceService } from '../../services/dueDiligenceService';
import { opportunityRiskService, riskExposure } from '../../services/opportunityRiskService';
import { landDealComparatorService } from '../../services/landDealComparatorService';
import { generateOpportunityDossierPdf } from '../../services/opportunityDossierService';
import { InvestorOpportunity } from '../../services/investorPortalService';

interface Props {
    opportunity: InvestorOpportunity;
    opportunityId: string;
    organizationId: string;
    userEmail?: string;
}

const GATES: CommitteeGate[] = [1, 2, 3, 4, 5, 6];

const DECISION_ICON: Record<CommitteeDecision, React.ReactNode> = {
    pendente: <Circle className="w-4 h-4 text-gray-300" />,
    aprovado: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    aprovado_condicionantes: <CheckCircle2 className="w-4 h-4 text-amber-600" />,
    reprovado: <XCircle className="w-4 h-4 text-red-600" />,
    devolvido: <RotateCcw className="w-4 h-4 text-amber-600" />,
    suspenso: <Pause className="w-4 h-4 text-gray-500" />,
    arquivado: <Archive className="w-4 h-4 text-gray-400" />,
};

const CommitteeGatePanel: React.FC<Props> = ({ opportunity, opportunityId, organizationId, userEmail }) => {
    const [decisions, setDecisions] = React.useState<CommitteeDecisionRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editingGate, setEditingGate] = React.useState<CommitteeGate | null>(null);
    const [form, setForm] = React.useState<Partial<CommitteeDecisionRecord>>({});
    const [saving, setSaving] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);
    const [dossier, setDossier] = React.useState<{ pendingCritical: number; openRisksCritical: number } | null>(null);

    const load = React.useCallback(() => {
        setLoading(true);
        investmentCommitteeService.listDecisions(opportunityId)
            .then(setDecisions)
            .catch(err => console.error('Erro ao carregar decisões do comitê', err))
            .finally(() => setLoading(false));
    }, [opportunityId]);

    React.useEffect(() => { load(); }, [load]);

    const decisionByGate = (gate: CommitteeGate) => decisions.find(d => d.gate === gate);
    const nextOpenGate = investmentCommitteeService.nextOpenGate(decisions);

    const openEditor = async (gate: CommitteeGate) => {
        const existing = decisionByGate(gate);
        setForm(existing ?? { organization_id: organizationId, opportunity_id: opportunityId, gate, decision: 'pendente' });
        setEditingGate(gate);
        try {
            const [ddItems, risks] = await Promise.all([
                dueDiligenceService.listItems(opportunityId),
                opportunityRiskService.listRisks(opportunityId),
            ]);
            setDossier({
                pendingCritical: ddItems.filter(i => (i.criticidade === 'critica' || i.criticidade === 'alta') && !['conforme', 'nao_aplicavel'].includes(i.status)).length,
                openRisksCritical: risks.filter(r => riskExposure(r) >= 20 && r.status !== 'encerrado' && r.status !== 'mitigado').length,
            });
        } catch (err) {
            console.error('Erro ao montar resumo do dossiê', err);
        }
    };

    const handleSave = async () => {
        if (!editingGate || !form.decision) return;
        setSaving(true);
        try {
            await investmentCommitteeService.decideGate({
                ...(form as CommitteeDecisionRecord),
                decided_by_email: form.decision !== 'pendente' ? (userEmail ?? form.decided_by_email) : form.decided_by_email,
            });
            setEditingGate(null);
            load();
        } catch (err) {
            console.error('Erro ao registrar decisão do gate', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleExportDossier = async () => {
        setExporting(true);
        try {
            const [ddItems, risks, landDealScenarios] = await Promise.all([
                dueDiligenceService.listItems(opportunityId),
                opportunityRiskService.listRisks(opportunityId),
                landDealComparatorService.listScenarios(opportunityId),
            ]);
            generateOpportunityDossierPdf({
                opportunity,
                ddItems,
                risks,
                landDealScenarios,
                decisions,
                currentGate: nextOpenGate,
            });
        } catch (err) {
            console.error('Erro ao gerar dossiê', err);
            alert('Erro ao gerar o dossiê. Tente novamente.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Comitê de Investimentos</h4>
                    <p className="text-xs text-gray-500 mt-1">Gates 1 a 6 — cada decisão libera a etapa seguinte do pipeline.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={handleExportDossier} disabled={exporting} className="gap-2">
                    <FileDown className="w-4 h-4" /> {exporting ? 'Gerando...' : 'Baixar Dossiê PDF'}
                </Button>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
            ) : (
                <div className="space-y-2">
                    {GATES.map(gate => {
                        const d = decisionByGate(gate);
                        const decision = d?.decision ?? 'pendente';
                        const isNext = gate === nextOpenGate;
                        return (
                            <div key={gate} className={`flex items-center justify-between p-4 rounded-2xl border ${isNext ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-white'}`}>
                                <div className="flex items-center gap-3">
                                    {DECISION_ICON[decision]}
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{COMMITTEE_GATE_LABELS[gate]}</p>
                                        <p className="text-xs text-gray-500">{COMMITTEE_DECISION_LABELS[decision]}{d?.decided_by_email ? ` — ${d.decided_by_email}` : ''}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => openEditor(gate)} className="gap-2 text-blue-600">
                                    <Gavel className="w-4 h-4" /> Decidir
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal open={editingGate !== null} onClose={() => setEditingGate(null)} size="lg">
                <ModalHeader
                    title={editingGate ? COMMITTEE_GATE_LABELS[editingGate] : ''}
                    description="A decisão registrada aqui move o status da oportunidade para a etapa correspondente."
                    onClose={() => setEditingGate(null)}
                />
                <ModalBody className="space-y-4">
                    {dossier && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className={`p-4 rounded-2xl border ${dossier.pendingCritical > 0 ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-gray-50/40'}`}>
                                <p className="text-xs font-black text-gray-400 uppercase">Due Diligence</p>
                                <p className="text-lg font-black text-gray-800">{dossier.pendingCritical} pendência(s) crítica/alta</p>
                            </div>
                            <div className={`p-4 rounded-2xl border ${dossier.openRisksCritical > 0 ? 'border-red-100 bg-red-50/40' : 'border-gray-100 bg-gray-50/40'}`}>
                                <p className="text-xs font-black text-gray-400 uppercase">Riscos</p>
                                <p className="text-lg font-black text-gray-800">{dossier.openRisksCritical} risco(s) crítico(s) em aberto</p>
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Decisão</label>
                        <select
                            value={form.decision ?? 'pendente'}
                            onChange={e => setForm({ ...form, decision: e.target.value as CommitteeDecision })}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                        >
                            {(['pendente', 'aprovado', 'aprovado_condicionantes', 'reprovado', 'devolvido', 'suspenso', 'arquivado'] as CommitteeDecision[]).map(d => (
                                <option key={d} value={d}>{COMMITTEE_DECISION_LABELS[d]}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Condicionantes</label>
                        <textarea rows={2} value={form.condicionantes ?? ''} onChange={e => setForm({ ...form, condicionantes: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Parecer</label>
                        <textarea rows={3} value={form.parecer ?? ''} onChange={e => setForm({ ...form, parecer: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setEditingGate(null)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : 'Registrar decisão'}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};

export default CommitteeGatePanel;
