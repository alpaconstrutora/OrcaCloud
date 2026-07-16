import React from 'react';
import { Plus, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import Button from '../ui/Button';
import { useConfirm } from '../ui/confirm';
import {
    opportunityRiskService, OpportunityRisk, RiskCategory, RiskStatus, RiskTendencia,
    RISK_CATEGORY_LABELS, RISK_STATUS_LABELS, riskExposure, riskLevel,
} from '../../services/opportunityRiskService';

interface Props {
    opportunityId: string;
    organizationId: string;
}

const CATEGORIES: RiskCategory[] = [
    'fundiario', 'juridico', 'ambiental', 'urbanistico', 'tecnico', 'mercado',
    'financeiro', 'tributario', 'societario', 'reputacional', 'prazo', 'vendas', 'construcao',
];

const emptyRisk = (organizationId: string, opportunityId: string): Omit<OpportunityRisk, 'id'> => ({
    organization_id: organizationId,
    opportunity_id: opportunityId,
    category: 'mercado',
    title: '',
    probabilidade: 3,
    impacto: 3,
    tendencia: 'estavel',
    status: 'aberto',
});

const RiskMatrixPanel: React.FC<Props> = ({ opportunityId, organizationId }) => {
    const confirm = useConfirm();
    const [risks, setRisks] = React.useState<OpportunityRisk[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editing, setEditing] = React.useState<OpportunityRisk | null>(null);
    const [saving, setSaving] = React.useState(false);

    const load = React.useCallback(() => {
        setLoading(true);
        opportunityRiskService.listRisks(opportunityId)
            .then(setRisks)
            .catch(err => console.error('Erro ao carregar riscos', err))
            .finally(() => setLoading(false));
    }, [opportunityId]);

    React.useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        if (!editing || !editing.title.trim()) return;
        setSaving(true);
        try {
            await opportunityRiskService.saveRisk(editing);
            setEditing(null);
            load();
        } catch (err) {
            console.error('Erro ao salvar risco', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (risk: OpportunityRisk) => {
        if (!risk.id) return;
        const ok = await confirm({ title: 'Excluir risco?', message: risk.title, variant: 'danger' });
        if (!ok) return;
        await opportunityRiskService.deleteRisk(risk.id);
        load();
    };

    const criticalCount = risks.filter(r => riskExposure(r) >= 20 && r.status !== 'encerrado' && r.status !== 'mitigado').length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Registro de Riscos</h4>
                    <p className="text-xs text-gray-500 mt-1">Matriz probabilidade × impacto por categoria.</p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setEditing(emptyRisk(organizationId, opportunityId) as OpportunityRisk)} className="gap-2">
                    <Plus className="w-4 h-4" /> Novo risco
                </Button>
            </div>

            {criticalCount > 0 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {criticalCount} risco(s) em exposição crítica ainda em aberto.
                </div>
            )}

            {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
            ) : risks.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <AlertTriangle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhum risco registrado</p>
                </div>
            ) : (
                <div className="border border-gray-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                    <table className="min-w-[760px] w-full text-left text-sm">
                        <thead className="bg-gray-50/80 text-gray-500 font-black uppercase tracking-wider text-xs border-b border-gray-100">
                            <tr>
                                <th className="p-4">Risco</th>
                                <th className="p-4">Categoria</th>
                                <th className="p-4">Prob. × Impacto</th>
                                <th className="p-4">Exposição</th>
                                <th className="p-4">Status</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {risks.map(risk => {
                                const exposure = riskExposure(risk);
                                const level = riskLevel(exposure);
                                return (
                                    <tr key={risk.id} className="hover:bg-gray-50/30">
                                        <td className="p-4 font-semibold text-gray-800">{risk.title}</td>
                                        <td className="p-4 text-gray-600">{RISK_CATEGORY_LABELS[risk.category]}</td>
                                        <td className="p-4 text-gray-500">{risk.probabilidade} × {risk.impacto}</td>
                                        <td className={`p-4 font-semibold ${level.color}`}>{exposure} — {level.label}</td>
                                        <td className="p-4 text-gray-600">{RISK_STATUS_LABELS[risk.status]}</td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1 justify-end">
                                                <button onClick={() => setEditing(risk)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                                                <button onClick={() => handleDelete(risk)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal open={!!editing} onClose={() => setEditing(null)} size="lg">
                <ModalHeader title={editing?.id ? 'Editar risco' : 'Novo risco'} onClose={() => setEditing(null)} />
                {editing && (
                    <ModalBody className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Categoria</label>
                                <select
                                    value={editing.category}
                                    onChange={e => setEditing({ ...editing, category: e.target.value as RiskCategory })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    {CATEGORIES.map(c => <option key={c} value={c}>{RISK_CATEGORY_LABELS[c]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Status</label>
                                <select
                                    value={editing.status}
                                    onChange={e => setEditing({ ...editing, status: e.target.value as RiskStatus })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    {(['aberto', 'em_mitigacao', 'mitigado', 'materializado', 'encerrado'] as RiskStatus[]).map(s => <option key={s} value={s}>{RISK_STATUS_LABELS[s]}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Risco *</label>
                            <input
                                type="text"
                                value={editing.title}
                                onChange={e => setEditing({ ...editing, title: e.target.value })}
                                placeholder="Ex: Atraso na aprovação de EIV"
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Causa</label>
                                <textarea rows={2} value={editing.causa ?? ''} onChange={e => setEditing({ ...editing, causa: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Consequência</label>
                                <textarea rows={2} value={editing.consequencia ?? ''} onChange={e => setEditing({ ...editing, consequencia: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Probabilidade (1-5)</label>
                                <input type="number" min={1} max={5} value={editing.probabilidade}
                                    onChange={e => setEditing({ ...editing, probabilidade: Math.min(5, Math.max(1, Number(e.target.value))) })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Impacto (1-5)</label>
                                <input type="number" min={1} max={5} value={editing.impacto}
                                    onChange={e => setEditing({ ...editing, impacto: Math.min(5, Math.max(1, Number(e.target.value))) })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Tendência</label>
                                <select
                                    value={editing.tendencia ?? 'estavel'}
                                    onChange={e => setEditing({ ...editing, tendencia: e.target.value as RiskTendencia })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    <option value="subindo">Subindo</option>
                                    <option value="estavel">Estável</option>
                                    <option value="descendo">Descendo</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Mitigação</label>
                                <textarea rows={2} value={editing.mitigacao ?? ''} onChange={e => setEditing({ ...editing, mitigacao: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Contingência</label>
                                <textarea rows={2} value={editing.contingencia ?? ''} onChange={e => setEditing({ ...editing, contingencia: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Responsável (e-mail)</label>
                                <input type="email" value={editing.responsavel_email ?? ''} onChange={e => setEditing({ ...editing, responsavel_email: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Prazo</label>
                                <input type="date" value={editing.prazo ?? ''} onChange={e => setEditing({ ...editing, prazo: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                        </div>
                    </ModalBody>
                )}
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} disabled={saving || !editing?.title.trim()}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};

export default RiskMatrixPanel;
