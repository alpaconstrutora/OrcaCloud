import React, { useState, useMemo } from 'react';
import { DollarSign, CheckCircle2, Clock, AlertCircle, TrendingUp, Building2, ChevronDown } from 'lucide-react';
import type { BrokerCommission } from '../../types';
import { brokerService } from '../../services/brokerService';

interface BrokerCommissionsProps {
    brokerEmail: string;
    organizationId?: string;
}

const STATUS_CONFIG: Record<BrokerCommission['status'], { label: string; color: string; bg: string; icon: React.ElementType }> = {
    PENDENTE: { label: 'Pendente', color: 'text-gray-500', bg: 'bg-gray-50', icon: Clock },
    PARCIAL: { label: 'Parcial', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertCircle },
    LIBERADA: { label: 'Liberada', color: 'text-blue-600', bg: 'bg-blue-50', icon: CheckCircle2 },
    PAGA: { label: 'Paga', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
};

const BrokerCommissions: React.FC<BrokerCommissionsProps> = ({ brokerEmail, organizationId }) => {
    const [commissions, setCommissions] = useState<BrokerCommission[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<BrokerCommission['status'] | 'all'>('all');

    React.useEffect(() => {
        const load = async () => {
            if (!organizationId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const data = await brokerService.listCommissions(organizationId, brokerEmail);
                setCommissions(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [organizationId, brokerEmail]);

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    const filtered = useMemo(() => {
        if (statusFilter === 'all') return commissions;
        return commissions.filter(c => c.status === statusFilter);
    }, [commissions, statusFilter]);

    const totals = useMemo(() => ({
        predicted: commissions.reduce((a, c) => a + (c.commission_predicted || 0), 0),
        released: commissions.reduce((a, c) => a + (c.commission_released || 0), 0),
        paid: commissions.reduce((a, c) => a + (c.commission_paid || 0), 0),
    }), [commissions]);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Prevista Total</p>
                            <p className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(totals.predicted)}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl"><TrendingUp className="w-6 h-6 text-gray-400" /></div>
                    </div>
                    <div className="mt-3 bg-gray-100 rounded-full h-2">
                        <div className="bg-gray-400 rounded-full h-2" style={{ width: '100%' }} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-blue-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">Liberada</p>
                            <p className="text-2xl font-black text-blue-700 mt-1">{formatCurrency(totals.released)}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-2xl"><CheckCircle2 className="w-6 h-6 text-blue-500" /></div>
                    </div>
                    <div className="mt-3 bg-blue-100 rounded-full h-2">
                        <div className="bg-blue-500 rounded-full h-2 transition-all" style={{ width: `${totals.predicted > 0 ? (totals.released / totals.predicted * 100) : 0}%` }} />
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-emerald-100 p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Paga</p>
                            <p className="text-2xl font-black text-emerald-700 mt-1">{formatCurrency(totals.paid)}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-2xl"><DollarSign className="w-6 h-6 text-emerald-500" /></div>
                    </div>
                    <div className="mt-3 bg-emerald-100 rounded-full h-2">
                        <div className="bg-emerald-500 rounded-full h-2 transition-all" style={{ width: `${totals.predicted > 0 ? (totals.paid / totals.predicted * 100) : 0}%` }} />
                    </div>
                </div>
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
                <button onClick={() => setStatusFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${statusFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    Todas ({commissions.length})
                </button>
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                    const count = commissions.filter(c => c.status === status).length;
                    const Icon = cfg.icon;
                    return (
                        <button key={status} onClick={() => setStatusFilter(status as BrokerCommission['status'])}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${statusFilter === status ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {cfg.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Commission List */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="divide-y divide-gray-100">
                    {filtered.map(comm => {
                        const cfg = STATUS_CONFIG[comm.status];
                        const Icon = cfg.icon;
                        const isExpanded = expandedId === comm.id;

                        return (
                            <div key={comm.id}>
                                <button onClick={() => setExpandedId(isExpanded ? null : comm.id)}
                                    className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                            <Building2 className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">Unidade {comm.unit_number} {comm.block ? `• ${comm.block}` : ''}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Venda: {formatCurrency(comm.sale_value)} • {comm.commission_pct}% comissão</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-sm font-black text-gray-900">{formatCurrency(comm.commission_predicted || 0)}</p>
                                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                                                <Icon className="w-3 h-3" />{cfg.label}
                                            </span>
                                        </div>
                                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>

                                {isExpanded && comm.milestones && (
                                    <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-200">
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Marcos de Liberação</h4>
                                            <div className="space-y-3">
                                                {comm.milestones.map((m, idx) => (
                                                    <div key={idx} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${m.paid ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                                                {m.paid ? <CheckCircle2 className="w-3.5 h-3.5 text-white" /> : <Clock className="w-3.5 h-3.5 text-white" />}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-900">{m.name}</p>
                                                                {m.date && <p className="text-[10px] text-gray-400">{new Date(m.date).toLocaleDateString('pt-BR')}</p>}
                                                            </div>
                                                        </div>
                                                        <span className={`text-sm font-black ${m.paid ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                            {formatCurrency(m.value)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between">
                                                <span className="text-xs font-black text-gray-500 uppercase">Total Previsto</span>
                                                <span className="text-sm font-black text-gray-900">{formatCurrency(comm.commission_predicted || 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default BrokerCommissions;
