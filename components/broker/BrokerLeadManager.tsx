import React, { useState, useMemo } from 'react';
import { Users, Plus, Shield, Phone, Mail, MessageSquare, Calendar, ChevronRight, Search, Clock, X, Eye } from 'lucide-react';
import type { BrokerLead, BrokerLeadStage, BrokerLeadInteraction } from '../../types';

interface BrokerLeadManagerProps {
    brokerEmail: string;
}

const STAGE_CONFIG: Record<BrokerLeadStage, { label: string; color: string; bg: string; border: string }> = {
    LEAD: { label: 'Lead', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' },
    VISITA: { label: 'Visita', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    PROPOSTA: { label: 'Proposta', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    NEGOCIACAO: { label: 'Negociação', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    VENDA: { label: 'Venda', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

const ORIGIN_LABELS: Record<string, string> = {
    SITE: 'Site', INDICACAO: 'Indicação', PLANTAO: 'Plantão',
    REDES_SOCIAIS: 'Redes Sociais', IMOBILIARIA: 'Imobiliária', OUTRO: 'Outro',
};

const generateDemoLeads = (email: string): BrokerLead[] => {
    const names = ['Ana Silva', 'Carlos Mendes', 'Mariana Costa', 'Pedro Almeida', 'Julia Santos', 'Fernando Lima', 'Beatriz Rocha', 'Lucas Oliveira'];
    const origins: BrokerLead['origin'][] = ['SITE', 'INDICACAO', 'PLANTAO', 'REDES_SOCIAIS', 'IMOBILIARIA'];
    const stages: BrokerLeadStage[] = ['LEAD', 'LEAD', 'VISITA', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'VENDA', 'LEAD'];
    const typologies = ['2Q', '2Q Suite', '3Q', '3Q Suite', 'Cobertura'];

    return names.map((name, i) => {
        const created = new Date();
        created.setDate(created.getDate() - (30 - i * 3));
        const protection = new Date(created);
        protection.setDate(protection.getDate() + 90);

        const interactions: BrokerLeadInteraction[] = [
            { id: `int-${i}-1`, date: created.toISOString(), type: 'LIGACAO', description: 'Primeiro contato via telefone' },
        ];
        if (stages[i] !== 'LEAD') {
            interactions.push({ id: `int-${i}-2`, date: new Date(created.getTime() + 3 * 86400000).toISOString(), type: 'VISITA', description: 'Visita ao stand de vendas' });
        }
        if (['PROPOSTA', 'NEGOCIACAO', 'VENDA'].includes(stages[i])) {
            interactions.push({ id: `int-${i}-3`, date: new Date(created.getTime() + 7 * 86400000).toISOString(), type: 'PROPOSTA', description: 'Proposta enviada para unidade 802' });
        }

        return {
            id: `lead-${i + 1}`,
            broker_id: 'demo',
            broker_email: email,
            organization_id: 'demo',
            name,
            cpf: `${String(100 + i).padStart(3, '0')}.${String(200 + i).padStart(3, '0')}.${String(300 + i).padStart(3, '0')}-${String(i).padStart(2, '0')}`,
            email: `${name.toLowerCase().replace(' ', '.')}@email.com`,
            phone: `(11) 9${String(8000 + i * 111).padStart(4, '0')}-${String(1000 + i * 111).padStart(4, '0')}`,
            origin: origins[i % origins.length],
            stage: stages[i],
            interest_typology: typologies[i % typologies.length],
            interest_block: i % 2 === 0 ? 'Torre A' : 'Torre B',
            budget_range: i % 3 === 0 ? 'R$ 300-400k' : i % 3 === 1 ? 'R$ 400-500k' : 'R$ 500k+',
            protection_until: protection.toISOString(),
            interactions,
            created_at: created.toISOString(),
        };
    });
};

const BrokerLeadManager: React.FC<BrokerLeadManagerProps> = ({ brokerEmail }) => {
    const [leads, setLeads] = useState<BrokerLead[]>(() => generateDemoLeads(brokerEmail));
    const [search, setSearch] = useState('');
    const [stageFilter, setStageFilter] = useState<BrokerLeadStage | 'all'>('all');
    const [viewMode, setViewMode] = useState<'funnel' | 'list'>('funnel');
    const [selectedLead, setSelectedLead] = useState<BrokerLead | null>(null);
    const [showNewLeadForm, setShowNewLeadForm] = useState(false);

    // New Lead form
    const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', origin: 'SITE' as BrokerLead['origin'], interest_typology: '', notes: '' });

    const filteredLeads = useMemo(() => {
        let result = leads;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(l => l.name.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.phone?.includes(q));
        }
        if (stageFilter !== 'all') result = result.filter(l => l.stage === stageFilter);
        return result;
    }, [leads, search, stageFilter]);

    const funnelData = useMemo(() => {
        const stages: BrokerLeadStage[] = ['LEAD', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'VENDA'];
        return stages.map(stage => ({
            stage,
            leads: leads.filter(l => l.stage === stage),
            count: leads.filter(l => l.stage === stage).length,
        }));
    }, [leads]);

    const handleAddLead = () => {
        if (!newLead.name) return;
        const protection = new Date();
        protection.setDate(protection.getDate() + 90);
        const lead: BrokerLead = {
            id: `lead-${Date.now()}`,
            broker_id: 'demo',
            broker_email: brokerEmail,
            organization_id: 'demo',
            name: newLead.name,
            email: newLead.email,
            phone: newLead.phone,
            origin: newLead.origin,
            stage: 'LEAD',
            interest_typology: newLead.interest_typology,
            protection_until: protection.toISOString(),
            notes: newLead.notes,
            interactions: [{ id: `int-${Date.now()}`, date: new Date().toISOString(), type: 'LIGACAO', description: 'Cadastro inicial' }],
            created_at: new Date().toISOString(),
        };
        setLeads(prev => [lead, ...prev]);
        setNewLead({ name: '', phone: '', email: '', origin: 'SITE', interest_typology: '', notes: '' });
        setShowNewLeadForm(false);
    };

    const advanceStage = (lead: BrokerLead) => {
        const order: BrokerLeadStage[] = ['LEAD', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'VENDA'];
        const idx = order.indexOf(lead.stage);
        if (idx < order.length - 1) {
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: order[idx + 1] } : l));
            if (selectedLead?.id === lead.id) setSelectedLead({ ...lead, stage: order[idx + 1] });
        }
    };

    const daysUntilExpiry = (dateStr: string) => {
        const diff = new Date(dateStr).getTime() - Date.now();
        return Math.ceil(diff / 86400000);
    };

    const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                    </div>
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        <button onClick={() => setViewMode('funnel')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'funnel' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>Funil</button>
                        <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>Lista</button>
                    </div>
                </div>
                <button onClick={() => setShowNewLeadForm(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                    <Plus className="w-4 h-4" /> Novo Lead
                </button>
            </div>

            {/* New Lead Modal */}
            {showNewLeadForm && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowNewLeadForm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-900">Novo Lead</h3>
                            <button onClick={() => setShowNewLeadForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nome *</label>
                                <input type="text" value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Nome completo" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Telefone</label>
                                <input type="text" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="(00) 00000-0000" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">E-mail</label>
                                <input type="text" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="email@exemplo.com" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Origem</label>
                                <select value={newLead.origin} onChange={e => setNewLead(p => ({ ...p, origin: e.target.value as any }))}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                                    {Object.entries(ORIGIN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Interesse</label>
                                <input type="text" value={newLead.interest_typology} onChange={e => setNewLead(p => ({ ...p, interest_typology: e.target.value }))}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Ex: 3Q Suite" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Observações</label>
                                <textarea value={newLead.notes} onChange={e => setNewLead(p => ({ ...p, notes: e.target.value }))} rows={2}
                                    className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 text-sm" />
                            </div>
                        </div>
                        <button onClick={handleAddLead} disabled={!newLead.name}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50">
                            Cadastrar Lead
                        </button>
                    </div>
                </div>
            )}

            {/* Funnel View */}
            {viewMode === 'funnel' && (
                <div className="grid grid-cols-5 gap-4">
                    {funnelData.map(({ stage, leads: stageLeads, count }) => {
                        const cfg = STAGE_CONFIG[stage];
                        return (
                            <div key={stage} className="space-y-3">
                                <div className={`rounded-xl p-3 ${cfg.bg} border ${cfg.border}`}>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${cfg.bg} ${cfg.color} border ${cfg.border}`}>{count}</span>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-hide">
                                    {stageLeads.map(lead => (
                                        <button key={lead.id} onClick={() => setSelectedLead(lead)}
                                            className={`w-full text-left bg-white rounded-xl p-3 border border-gray-100 hover:shadow-md hover:border-indigo-200 transition-all ${selectedLead?.id === lead.id ? 'ring-2 ring-indigo-500 border-indigo-300' : ''}`}>
                                            <p className="text-sm font-bold text-gray-900 truncate">{lead.name}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{lead.interest_typology || 'Sem preferência'}</p>
                                            <div className="flex items-center gap-1 mt-2">
                                                <Shield className="w-3 h-3 text-emerald-500" />
                                                <span className="text-[10px] font-bold text-emerald-600">{daysUntilExpiry(lead.protection_until)}d</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Lead</th>
                                    <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Contato</th>
                                    <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Origem</th>
                                    <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Etapa</th>
                                    <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Proteção</th>
                                    <th className="text-left p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredLeads.map(lead => {
                                    const cfg = STAGE_CONFIG[lead.stage];
                                    const days = daysUntilExpiry(lead.protection_until);
                                    return (
                                        <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <p className="text-sm font-bold text-gray-900">{lead.name}</p>
                                                <p className="text-[10px] text-gray-400">{lead.interest_typology} • {lead.interest_block}</p>
                                            </td>
                                            <td className="p-4">
                                                <p className="text-xs text-gray-600">{lead.phone}</p>
                                                <p className="text-[10px] text-gray-400">{lead.email}</p>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-xs font-bold text-gray-600">{ORIGIN_LABELS[lead.origin]}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1">
                                                    <Shield className={`w-3.5 h-3.5 ${days < 15 ? 'text-red-500' : days < 30 ? 'text-amber-500' : 'text-emerald-500'}`} />
                                                    <span className={`text-xs font-bold ${days < 15 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>{days}d</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex gap-1">
                                                    <button onClick={() => setSelectedLead(lead)} className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-600 transition-colors">
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    {lead.stage !== 'VENDA' && (
                                                        <button onClick={() => advanceStage(lead)} className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors" title="Avançar etapa">
                                                            <ChevronRight className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Lead Detail Drawer */}
            {selectedLead && (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h3 className="text-xl font-black text-gray-900">{selectedLead.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{selectedLead.email} • {selectedLead.phone}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${STAGE_CONFIG[selectedLead.stage].bg} ${STAGE_CONFIG[selectedLead.stage].color} border ${STAGE_CONFIG[selectedLead.stage].border}`}>
                                {STAGE_CONFIG[selectedLead.stage].label}
                            </span>
                            <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-black text-gray-400 uppercase">Origem</p>
                            <p className="text-sm font-bold text-gray-900">{ORIGIN_LABELS[selectedLead.origin]}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-black text-gray-400 uppercase">Interesse</p>
                            <p className="text-sm font-bold text-gray-900">{selectedLead.interest_typology || '-'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-black text-gray-400 uppercase">Faixa</p>
                            <p className="text-sm font-bold text-gray-900">{selectedLead.budget_range || '-'}</p>
                        </div>
                        <div className={`rounded-xl p-3 ${daysUntilExpiry(selectedLead.protection_until) < 15 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                            <p className="text-[10px] font-black text-gray-400 uppercase">Proteção</p>
                            <div className="flex items-center gap-1">
                                <Shield className={`w-4 h-4 ${daysUntilExpiry(selectedLead.protection_until) < 15 ? 'text-red-500' : 'text-emerald-500'}`} />
                                <p className={`text-sm font-bold ${daysUntilExpiry(selectedLead.protection_until) < 15 ? 'text-red-700' : 'text-emerald-700'}`}>
                                    {daysUntilExpiry(selectedLead.protection_until)} dias restantes
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Timeline */}
                    <div>
                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Histórico de Interações</h4>
                        <div className="space-y-3">
                            {selectedLead.interactions?.map((interaction, i) => {
                                const iconMap: Record<string, any> = {
                                    LIGACAO: Phone, VISITA: Calendar, EMAIL: Mail,
                                    WHATSAPP: MessageSquare, REUNIAO: Users, PROPOSTA: ChevronRight
                                };
                                const Icon = iconMap[interaction.type] || Clock;
                                return (
                                    <div key={interaction.id} className="flex items-start gap-3">
                                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                            <Icon className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-900">{interaction.description}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(interaction.date)}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {selectedLead.stage !== 'VENDA' && (
                        <div className="mt-6 pt-4 border-t border-gray-100">
                            <button onClick={() => advanceStage(selectedLead)}
                                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                                <ChevronRight className="w-4 h-4" />
                                Avançar para {STAGE_CONFIG[
                                    (['LEAD', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'VENDA'] as BrokerLeadStage[])[
                                    ['LEAD', 'VISITA', 'PROPOSTA', 'NEGOCIACAO', 'VENDA'].indexOf(selectedLead.stage) + 1
                                    ] || 'VENDA'
                                ].label}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BrokerLeadManager;
