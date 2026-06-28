import React from 'react';
import { Building2, Plus, Trash2, Users, ChevronDown, ChevronUp, DollarSign, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../utils/financialMath';
import { speService, SpeEntity, SpePartner } from '../../services/speService';
import { investorService, Investor } from '../../services/investorService';

interface Props {
    organizationId: string;
    isAdmin?: boolean;
}

const emptyEntity = (orgId: string): Omit<SpeEntity, 'id' | 'created_at'> => ({
    organization_id: orgId,
    name: '',
    cnpj: '',
    capital_social: 0,
});

const SpeManager: React.FC<Props> = ({ organizationId, isAdmin }) => {
    const [entities, setEntities] = React.useState<SpeEntity[]>([]);
    const [investors, setInvestors] = React.useState<Investor[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [expanded, setExpanded] = React.useState<string | null>(null);
    const [partners, setPartners] = React.useState<Record<string, SpePartner[]>>({});
    const [showNewEntity, setShowNewEntity] = React.useState(false);
    const [entityForm, setEntityForm] = React.useState(emptyEntity(organizationId));
    const [savingEntity, setSavingEntity] = React.useState(false);
    // partner add form per SPE
    const [partnerForm, setPartnerForm] = React.useState<Record<string, { investor_id: string; ownership_pct: number; capital_calls_total: number }>>({});
    const [capitalInput, setCapitalInput] = React.useState<Record<string, { amount: number; type: 'call' | 'payment' }>>({});

    React.useEffect(() => {
        Promise.all([
            speService.list(organizationId),
            investorService.listInvestors(organizationId),
        ]).then(([spes, invs]) => {
            setEntities(spes);
            setInvestors(invs);
        }).catch(err => console.error('Error loading SPE data', err))
          .finally(() => setLoading(false));
    }, [organizationId]);

    const loadPartners = async (speId: string) => {
        if (partners[speId]) return;
        const data = await speService.listPartners(speId);
        setPartners(p => ({ ...p, [speId]: data }));
    };

    const handleExpand = async (id: string) => {
        const next = expanded === id ? null : id;
        setExpanded(next);
        if (next) await loadPartners(next);
    };

    const handleSaveEntity = async () => {
        if (!entityForm.name.trim()) { alert('Informe o nome da SPE.'); return; }
        setSavingEntity(true);
        try {
            const saved = await speService.save(entityForm as SpeEntity);
            setEntities(prev => [saved, ...prev]);
            setEntityForm(emptyEntity(organizationId));
            setShowNewEntity(false);
        } catch (err) {
            console.error('Error saving SPE', err);
            alert('Erro ao salvar SPE.');
        } finally {
            setSavingEntity(false);
        }
    };

    const handleRemoveEntity = async (id: string) => {
        try {
            await speService.remove(id);
            setEntities(prev => prev.filter(e => e.id !== id));
        } catch (err) {
            console.error('Error removing SPE', err);
        }
    };

    const handleAddPartner = async (speId: string) => {
        const f = partnerForm[speId];
        if (!f?.investor_id) { alert('Selecione um investidor.'); return; }
        try {
            const saved = await speService.savePartner({
                spe_entity_id: speId,
                investor_id: f.investor_id,
                ownership_pct: f.ownership_pct || 0,
                capital_calls_total: f.capital_calls_total || 0,
                capital_paid: 0,
                quota_count: 1,
            });
            const inv = investors.find(i => i.id === f.investor_id);
            setPartners(prev => ({
                ...prev,
                [speId]: [...(prev[speId] || []), { ...saved, investor_name: inv?.name, investor_email: inv?.email }],
            }));
            setPartnerForm(prev => ({ ...prev, [speId]: { investor_id: '', ownership_pct: 0, capital_calls_total: 0 } }));
        } catch (err) {
            console.error('Error adding partner', err);
            alert('Erro ao adicionar sócio.');
        }
    };

    const handleCapitalAction = async (partnerId: string, speId: string) => {
        const c = capitalInput[partnerId];
        if (!c?.amount || c.amount <= 0) { alert('Informe um valor.'); return; }
        try {
            if (c.type === 'call') {
                await speService.addCapitalCall(partnerId, c.amount);
            } else {
                await speService.addCapitalPayment(partnerId, c.amount);
            }
            // Reload partners
            const updated = await speService.listPartners(speId);
            setPartners(prev => ({ ...prev, [speId]: updated }));
            setCapitalInput(prev => ({ ...prev, [partnerId]: { amount: 0, type: 'call' } }));
        } catch (err) {
            console.error('Error capital action', err);
        }
    };

    const totalPct = (speId: string) =>
        (partners[speId] || []).reduce((a, p) => a + Number(p.ownership_pct), 0);

    if (loading) return <div className="py-12 text-center text-sm text-gray-400">Carregando SPEs...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">Gestão de SPEs</h3>
                {isAdmin && (
                    <button
                        onClick={() => setShowNewEntity(v => !v)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-button font-bold hover:bg-blue-700"
                    >
                        <Plus className="w-4 h-4" /> Nova SPE
                    </button>
                )}
            </div>

            {/* New SPE form */}
            {isAdmin && showNewEntity && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-3 gap-4">
                        <label className="flex flex-col gap-1 col-span-3 md:col-span-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nome da SPE</span>
                            <input type="text" value={entityForm.name}
                                onChange={e => setEntityForm(f => ({ ...f, name: e.target.value }))}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: SPE Empreendimento Cambuí I" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">CNPJ</span>
                            <input type="text" value={entityForm.cnpj || ''}
                                onChange={e => setEntityForm(f => ({ ...f, cnpj: e.target.value }))}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="00.000.000/0001-00" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Capital Social (R$)</span>
                            <input type="number" min="0" step="0.01" value={entityForm.capital_social || ''}
                                onChange={e => setEntityForm(f => ({ ...f, capital_social: parseFloat(e.target.value) || 0 }))}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0,00" />
                        </label>
                    </div>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => setShowNewEntity(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                        <button onClick={handleSaveEntity} disabled={savingEntity}
                            className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-60">
                            {savingEntity ? 'Salvando...' : 'Criar SPE'}
                        </button>
                    </div>
                </div>
            )}

            {entities.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                    <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-400">Nenhuma SPE cadastrada.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {entities.map(entity => {
                        const isOpen = expanded === entity.id;
                        const pts = partners[entity.id!] || [];
                        const pct = totalPct(entity.id!);

                        return (
                            <div key={entity.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-5 flex items-center gap-4 cursor-pointer hover:bg-gray-50/50"
                                    onClick={() => handleExpand(entity.id!)}>
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900">{entity.name}</p>
                                        <p className="text-xs text-gray-400">{entity.cnpj || 'CNPJ não informado'} • Capital: {formatCurrency(entity.capital_social)}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                                            <Users className="w-3.5 h-3.5" /> {pts.length || '—'} sócios
                                        </span>
                                        {isAdmin && (
                                            <button onClick={e => { e.stopPropagation(); handleRemoveEntity(entity.id!); }}
                                                className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </div>

                                {isOpen && (
                                    <div className="border-t border-gray-50 p-5 space-y-4 animate-in fade-in duration-150">
                                        {/* % total warning */}
                                        {pts.length > 0 && Math.abs(pct - 100) > 0.01 && (
                                            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">
                                                <AlertCircle className="w-4 h-4 shrink-0" />
                                                Participações somam {pct.toFixed(2)}% (deveria ser 100%)
                                            </div>
                                        )}

                                        {/* Partners table */}
                                        {pts.length > 0 && (
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        <th className="pb-2">Sócio</th>
                                                        <th className="pb-2 text-right">%</th>
                                                        <th className="pb-2 text-right">Chamado</th>
                                                        <th className="pb-2 text-right">Pago</th>
                                                        {isAdmin && <th className="pb-2 text-right">Capital</th>}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {pts.map(p => {
                                                        const ci = capitalInput[p.id!] || { amount: 0, type: 'call' as const };
                                                        return (
                                                            <tr key={p.id} className="text-sm">
                                                                <td className="py-2">
                                                                    <p className="font-medium text-gray-900">{p.investor_name || '—'}</p>
                                                                    <p className="text-xs text-gray-400">{p.investor_email}</p>
                                                                </td>
                                                                <td className="py-2 text-right font-bold text-blue-600">{Number(p.ownership_pct).toFixed(2)}%</td>
                                                                <td className="py-2 text-right text-gray-700">{formatCurrency(Number(p.capital_calls_total))}</td>
                                                                <td className="py-2 text-right text-emerald-700 font-bold">{formatCurrency(Number(p.capital_paid))}</td>
                                                                {isAdmin && (
                                                                    <td className="py-2 text-right">
                                                                        <div className="flex items-center justify-end gap-1">
                                                                            <select
                                                                                value={ci.type}
                                                                                onChange={e => setCapitalInput(c => ({ ...c, [p.id!]: { ...ci, type: e.target.value as 'call' | 'payment' } }))}
                                                                                className="px-1 py-1 border border-gray-200 rounded text-[10px]"
                                                                            >
                                                                                <option value="call">Chamar</option>
                                                                                <option value="payment">Pagar</option>
                                                                            </select>
                                                                            <input type="number" min="0" step="0.01"
                                                                                value={ci.amount || ''}
                                                                                onChange={e => setCapitalInput(c => ({ ...c, [p.id!]: { ...ci, amount: parseFloat(e.target.value) || 0 } }))}
                                                                                className="w-24 px-2 py-1 border border-gray-200 rounded text-form-input focus:outline-none"
                                                                                placeholder="0,00"
                                                                            />
                                                                            <button
                                                                                onClick={() => handleCapitalAction(p.id!, entity.id!)}
                                                                                className="p-1.5 bg-blue-600 text-white rounded text-button hover:bg-blue-700"
                                                                            >
                                                                                <DollarSign className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}

                                        {/* Add partner form (admin) */}
                                        {isAdmin && (
                                            <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-gray-50">
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Investidor</span>
                                                    <select
                                                        value={partnerForm[entity.id!]?.investor_id || ''}
                                                        onChange={e => setPartnerForm(f => ({ ...f, [entity.id!]: { ...f[entity.id!], investor_id: e.target.value } }))}
                                                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-40"
                                                    >
                                                        <option value="">Selecione...</option>
                                                        {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                                    </select>
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Participação (%)</span>
                                                    <input type="number" min="0" max="100" step="0.01"
                                                        value={partnerForm[entity.id!]?.ownership_pct || ''}
                                                        onChange={e => setPartnerForm(f => ({ ...f, [entity.id!]: { ...f[entity.id!], ownership_pct: parseFloat(e.target.value) || 0 } }))}
                                                        className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="0"
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Capital Chamado (R$)</span>
                                                    <input type="number" min="0" step="0.01"
                                                        value={partnerForm[entity.id!]?.capital_calls_total || ''}
                                                        onChange={e => setPartnerForm(f => ({ ...f, [entity.id!]: { ...f[entity.id!], capital_calls_total: parseFloat(e.target.value) || 0 } }))}
                                                        className="w-32 px-2 py-1.5 border border-gray-200 rounded-lg text-form-input focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="0,00"
                                                    />
                                                </label>
                                                <button
                                                    onClick={() => handleAddPartner(entity.id!)}
                                                    className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-button font-bold hover:bg-blue-700"
                                                >
                                                    <Plus className="w-4 h-4" /> Sócio
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SpeManager;
