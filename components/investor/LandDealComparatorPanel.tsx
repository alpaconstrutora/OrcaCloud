import React from 'react';
import { Plus, Trash2, Pencil, CheckCircle2, Scale } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/modal';
import Button from '../ui/Button';
import { useConfirm } from '../ui/confirm';
import { fmtBRL, fmtPct } from '../../utils/format';
import {
    landDealComparatorService, LandDealScenario, LandDealType, LandDealPremises,
    LAND_DEAL_TYPE_LABELS, calculateLandCostEquivalent, calculateMaxCashExposure, calculateDealImpactOnStudy,
} from '../../services/landDealComparatorService';

interface Props {
    opportunityId: string;
    organizationId: string;
    vgv?: number | null;
    baseLandCost?: number | null;
    baseMonthlyFlows?: number[];
}

const DEAL_TYPES: LandDealType[] = ['compra_direta', 'permuta_fisica', 'permuta_financeira', 'opcao_compra', 'sociedade'];

const emptyScenario = (organizationId: string, opportunityId: string): Omit<LandDealScenario, 'id'> => ({
    organization_id: organizationId,
    opportunity_id: opportunityId,
    deal_type: 'compra_direta',
    name: '',
    premises_json: {},
});

const PremisesFields: React.FC<{ dealType: LandDealType; premises: LandDealPremises; onChange: (p: LandDealPremises) => void }> = ({ dealType, premises, onChange }) => {
    const num = (v: string) => (v === '' ? undefined : Number(v));
    switch (dealType) {
        case 'compra_direta':
            return (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Valor total</label>
                        <input type="number" value={premises.valor_total ?? ''} onChange={e => onChange({ ...premises, valor_total: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Entrada</label>
                        <input type="number" value={premises.entrada ?? ''} onChange={e => onChange({ ...premises, entrada: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Nº de parcelas</label>
                        <input type="number" value={premises.num_parcelas ?? ''} onChange={e => onChange({ ...premises, num_parcelas: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Correção mensal (%)</label>
                        <input type="number" step="0.01" value={premises.taxa_correcao_mensal_pct ?? ''} onChange={e => onChange({ ...premises, taxa_correcao_mensal_pct: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                </div>
            );
        case 'permuta_fisica':
            return (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Unidades prometidas</label>
                        <input type="number" value={premises.unidades_prometidas ?? ''} onChange={e => onChange({ ...premises, unidades_prometidas: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Valor de referência das unidades</label>
                        <input type="number" value={premises.valor_referencia_unidades ?? ''} onChange={e => onChange({ ...premises, valor_referencia_unidades: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Prazo de entrega (meses)</label>
                        <input type="number" value={premises.prazo_entrega_meses ?? ''} onChange={e => onChange({ ...premises, prazo_entrega_meses: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                </div>
            );
        case 'permuta_financeira':
            return (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">% sobre o VGV</label>
                        <input type="number" step="0.1" value={premises.percentual_sobre_vgv ?? ''} onChange={e => onChange({ ...premises, percentual_sobre_vgv: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Valor mínimo garantido</label>
                        <input type="number" value={premises.valor_minimo_garantido ?? ''} onChange={e => onChange({ ...premises, valor_minimo_garantido: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                </div>
            );
        case 'opcao_compra':
            return (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Prêmio da opção</label>
                        <input type="number" value={premises.premio_opcao ?? ''} onChange={e => onChange({ ...premises, premio_opcao: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Prazo da opção (meses)</label>
                        <input type="number" value={premises.prazo_opcao_meses ?? ''} onChange={e => onChange({ ...premises, prazo_opcao_meses: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Valor de exercício</label>
                        <input type="number" value={premises.valor_exercicio ?? ''} onChange={e => onChange({ ...premises, valor_exercicio: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                </div>
            );
        case 'sociedade':
            return (
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Participação do proprietário (%)</label>
                        <input type="number" step="0.1" value={premises.participacao_pct ?? ''} onChange={e => onChange({ ...premises, participacao_pct: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Aporte de terreno equivalente</label>
                        <input type="number" value={premises.aporte_terreno_equivalente ?? ''} onChange={e => onChange({ ...premises, aporte_terreno_equivalente: num(e.target.value) })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" /></div>
                </div>
            );
    }
};

const LandDealComparatorPanel: React.FC<Props> = ({ opportunityId, organizationId, vgv, baseLandCost, baseMonthlyFlows }) => {
    const confirm = useConfirm();
    const [scenarios, setScenarios] = React.useState<LandDealScenario[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editing, setEditing] = React.useState<LandDealScenario | null>(null);
    const [saving, setSaving] = React.useState(false);

    const load = React.useCallback(() => {
        setLoading(true);
        landDealComparatorService.listScenarios(opportunityId)
            .then(setScenarios)
            .catch(err => console.error('Erro ao carregar modelos de aquisição', err))
            .finally(() => setLoading(false));
    }, [opportunityId]);

    React.useEffect(() => { load(); }, [load]);

    const computeMetrics = (dealType: LandDealType, premises: LandDealPremises) => {
        const landCostEquivalent = calculateLandCostEquivalent(dealType, premises, vgv ?? undefined);
        const maxCashExposure = calculateMaxCashExposure(dealType, premises);
        const impact = baseMonthlyFlows && baseMonthlyFlows.length > 0 && baseLandCost != null
            ? calculateDealImpactOnStudy(dealType, premises, baseMonthlyFlows, baseLandCost, vgv ?? undefined)
            : { impactTirPct: null, impactVpl: null };
        return { landCostEquivalent, maxCashExposure, ...impact };
    };

    const handleSave = async () => {
        if (!editing || !editing.name.trim()) return;
        setSaving(true);
        try {
            const metrics = computeMetrics(editing.deal_type, editing.premises_json);
            await landDealComparatorService.saveScenario({
                ...editing,
                land_cost_equivalent: metrics.landCostEquivalent,
                max_cash_exposure: metrics.maxCashExposure,
                impact_tir_pct: metrics.impactTirPct,
                impact_vpl: metrics.impactVpl,
            });
            setEditing(null);
            load();
        } catch (err) {
            console.error('Erro ao salvar modelo de aquisição', err);
            alert('Erro ao salvar. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (scenario: LandDealScenario) => {
        if (!scenario.id) return;
        const ok = await confirm({ title: 'Excluir modelo de aquisição?', message: scenario.name, variant: 'danger' });
        if (!ok) return;
        await landDealComparatorService.deleteScenario(scenario.id);
        load();
    };

    const handleSelect = async (scenario: LandDealScenario) => {
        if (!scenario.id) return;
        await landDealComparatorService.selectScenario(opportunityId, scenario.id);
        load();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">Comparador de Modelos de Aquisição</h4>
                    <p className="text-xs text-gray-500 mt-1">Compra direta × permuta física × permuta financeira × opção × sociedade.</p>
                </div>
                <Button variant="primary" size="sm" onClick={() => setEditing(emptyScenario(organizationId, opportunityId) as LandDealScenario)} className="gap-2">
                    <Plus className="w-4 h-4" /> Novo modelo
                </Button>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
            ) : scenarios.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <Scale className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhum modelo de aquisição cadastrado</p>
                </div>
            ) : (
                <div className="border border-gray-100 rounded-3xl overflow-x-auto bg-white shadow-sm">
                    <table className="min-w-[820px] w-full text-left text-sm">
                        <thead className="bg-gray-50/80 text-gray-500 font-black uppercase tracking-wider text-xs border-b border-gray-100">
                            <tr>
                                <th className="p-4">Modelo</th>
                                <th className="p-4">Tipo</th>
                                <th className="p-4">Custo equivalente</th>
                                <th className="p-4">Exposição máxima</th>
                                <th className="p-4">Impacto TIR</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {scenarios.map(scenario => (
                                <tr key={scenario.id} className={`hover:bg-gray-50/30 ${scenario.is_selected ? 'bg-emerald-50/40' : ''}`}>
                                    <td className="p-4 font-semibold text-gray-800 flex items-center gap-2">
                                        {scenario.is_selected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                                        {scenario.name}
                                    </td>
                                    <td className="p-4 text-gray-600">{LAND_DEAL_TYPE_LABELS[scenario.deal_type]}</td>
                                    <td className="p-4 text-gray-700 font-mono">{scenario.land_cost_equivalent != null ? fmtBRL(scenario.land_cost_equivalent) : '—'}</td>
                                    <td className="p-4 text-gray-700 font-mono">{scenario.max_cash_exposure != null ? fmtBRL(scenario.max_cash_exposure) : '—'}</td>
                                    <td className="p-4 text-gray-700 font-mono">{scenario.impact_tir_pct != null ? fmtPct(scenario.impact_tir_pct) : '—'}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-1 justify-end">
                                            {!scenario.is_selected && (
                                                <button onClick={() => handleSelect(scenario)} className="text-xs font-bold text-blue-600 hover:underline mr-2">Selecionar</button>
                                            )}
                                            <button onClick={() => setEditing(scenario)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil className="w-3.5 h-3.5 text-gray-500" /></button>
                                            <button onClick={() => handleDelete(scenario)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal open={!!editing} onClose={() => setEditing(null)} size="lg">
                <ModalHeader title={editing?.id ? 'Editar modelo de aquisição' : 'Novo modelo de aquisição'} onClose={() => setEditing(null)} />
                {editing && (
                    <ModalBody className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Tipo de negócio</label>
                                <select
                                    value={editing.deal_type}
                                    onChange={e => setEditing({ ...editing, deal_type: e.target.value as LandDealType, premises_json: {} })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
                                >
                                    {DEAL_TYPES.map(t => <option key={t} value={t}>{LAND_DEAL_TYPE_LABELS[t]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Nome do cenário *</label>
                                <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm" />
                            </div>
                        </div>
                        <PremisesFields
                            dealType={editing.deal_type}
                            premises={editing.premises_json}
                            onChange={p => setEditing({ ...editing, premises_json: p })}
                        />
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Observações</label>
                            <textarea rows={2} value={editing.notes ?? ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
                        </div>
                    </ModalBody>
                )}
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} disabled={saving || !editing?.name.trim()}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};

export default LandDealComparatorPanel;
