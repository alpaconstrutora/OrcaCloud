import React, { useState, useMemo } from 'react';
import { Building2, FileText, LayoutGrid, Send, CheckCircle2, DollarSign, Users, Briefcase, FolderOpen, Trophy, BookOpen, Calendar, MessageSquare, BarChart3, Activity, Link2 } from 'lucide-react';
import PropertyUnitMap from './common/PropertyUnitMap';
import BrokerProposalSimulator from './broker/BrokerProposalSimulator';
import BrokerLeadManager from './broker/BrokerLeadManager';
import BrokerCommissions from './broker/BrokerCommissions';
import BrokerMaterials from './broker/BrokerMaterials';
import BrokerRanking from './broker/BrokerRanking';
import BrokerTraining from './broker/BrokerTraining';
import BrokerEvents from './broker/BrokerEvents';
import BrokerChat from './broker/BrokerChat';
import BrokerAnalytics from './broker/BrokerAnalytics';
import BrokerHealthPanel from './broker/BrokerHealthPanel';
import BrokerIntegrations from './broker/BrokerIntegrations';
import { useStore } from '../store/useStore';
import { commercialService } from '../services/commercialService';
import { brokerService } from '../services/brokerService';
import { PropertyStatus, UserProfile, ProfileGroup } from '../types';
import type { BrokerUnit, BrokerProposal, BrokerProfile } from '../types';

type PortalTab = 'estoque' | 'propostas' | 'leads' | 'comissoes' | 'materiais' | 'ranking' | 'treinamento' | 'agenda' | 'chat' | 'analytics' | 'saude' | 'integracoes';

interface BrokerPortalProps {
    profile: { group: string; role: string; email?: string };
    activeTab?: PortalTab;
    organizationId?: string;
}

const StatCard = ({ title, value, subtext, icon: Icon, color }: any) => (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex items-start justify-between hover:shadow-md transition-all">
        <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
            <h3 className="text-2xl font-black text-gray-900">{value}</h3>
            {subtext && <p className="text-xs mt-1.5 text-gray-500 font-medium">{subtext}</p>}
        </div>
        <div className={`p-4 rounded-2xl ${color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
            color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                color === 'amber' ? 'bg-amber-50 text-amber-600' :
                    color === 'blue' ? 'bg-blue-50 text-blue-600' :
                        color === 'purple' ? 'bg-purple-50 text-purple-600' :
                            'bg-gray-50 text-gray-600'
            }`}>
            <Icon className="w-6 h-6" />
        </div>
    </div>
);

const TABS: { id: PortalTab; label: string; icon: any }[] = [
    { id: 'estoque', label: 'Estoque', icon: LayoutGrid },
    { id: 'propostas', label: 'Propostas', icon: FileText },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'comissoes', label: 'Comissões', icon: DollarSign },
    { id: 'materiais', label: 'Materiais', icon: FolderOpen },
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    { id: 'treinamento', label: 'Treinamento', icon: BookOpen },
    { id: 'agenda', label: 'Agenda', icon: Calendar },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'saude', label: 'Saúde', icon: Activity },
    { id: 'integracoes', label: 'Integrações', icon: Link2 },
];

const BrokerPortal: React.FC<BrokerPortalProps> = ({ profile, activeTab = 'estoque', organizationId: initialOrgId }) => {
    const { organizations } = useStore();
    const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(initialOrgId || organizations[0]?.id);
    const [currentTab, setCurrentTab] = useState<PortalTab>(activeTab);
    const [selectedPurpose, setSelectedPurpose] = useState<'SALE' | 'RENTAL' | 'BOTH'>('BOTH');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [units, setUnits] = useState<BrokerUnit[]>([]);
    const [loading, setLoading] = useState(true);
    const [proposals, setProposals] = useState<Partial<BrokerProposal>[]>([]);
    const [commercialDeals, setCommercialDeals] = useState<any[]>([]);
    const [selectedUnit, setSelectedUnit] = useState<BrokerUnit | null>(null);
    const [showSimulator, setShowSimulator] = useState(false);

    // New state for impersonation
    const [allBrokers, setAllBrokers] = useState<BrokerProfile[]>([]);
    const [selectedAdminBroker, setSelectedAdminBroker] = useState<BrokerProfile | null>(null);

    const effectiveBrokerEmail = (selectedAdminBroker ? selectedAdminBroker.email : profile?.email)?.toLowerCase();

    // Filtros unificados baseados no corretor logado/impersonado
    const myProposals = useMemo(() => {
        if (!proposals) return [];
        if (!effectiveBrokerEmail) return [];
        return proposals.filter(p => p.broker_email?.toLowerCase() === effectiveBrokerEmail);
    }, [proposals, effectiveBrokerEmail]);

    React.useEffect(() => {
        if (profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER || profile?.group === ProfileGroup.DEVELOPER || profile?.role === 'ADMINISTRADOR' || profile?.group === 'DESENVOLVEDOR') {
            const loadBrokers = async () => {
                if (!selectedOrgId) return;
                try {
                    const data = await brokerService.listProfiles(selectedOrgId);
                    setAllBrokers(data);
                } catch (error) {
                    console.error("Erro ao carregar lista de corretores:", error);
                }
            };
            loadBrokers();
        }
    }, [profile?.role, profile?.group, selectedOrgId]);

    React.useEffect(() => {
        const fetchStock = async () => {
            const orgId = selectedOrgId;
            if (!orgId) return;
            setLoading(true);
            try {
                const [propertiesData, proposalsData, dealsData] = await Promise.all([
                    commercialService.listProperties(orgId, undefined, selectedPurpose),
                    brokerService.listProposals(orgId),
                    commercialService.listDeals()
                ]);
                setUnits(propertiesData as BrokerUnit[]);
                setProposals(proposalsData);
                setCommercialDeals(dealsData);
            } catch (error) {
                console.error("Erro ao carregar dados do portal:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchStock();
    }, [selectedOrgId, selectedPurpose]);

    // Update selectedOrgId if organizations load later
    React.useEffect(() => {
        if (!selectedOrgId && organizations.length > 0) {
            setSelectedOrgId(organizations[0]?.id);
        }
    }, [organizations, selectedOrgId]);

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

    // myProposals already correctly declared above

    const stats = useMemo(() => {
        return {
            available: units.filter(u => u.status === PropertyStatus.AVAILABLE && u.type !== 'BUILDING').length,
            sent: myProposals.filter(p => p.status === 'ENVIADA').length,
            approved: myProposals.filter(p => p.status === 'APROVADA').length,
            totalCommission: myProposals.filter(p => p.status === 'APROVADA').reduce((acc, p) => acc + ((p.total_value || 0) * 0.05), 0),
        };
    }, [units, myProposals]);

    const buildings = useMemo(() => units.filter(u => u.type === 'BUILDING'), [units]);
    const displayUnits = useMemo(() => {
        let actualUnits = units.filter(u => u.type !== 'BUILDING');
        if (selectedBuildingId !== 'all') {
            actualUnits = actualUnits.filter(u => u.parent_id === selectedBuildingId);
        }
        return actualUnits;
    }, [units, selectedBuildingId]);

    const handleReserve = (unit: BrokerUnit) => {
        alert(`Unidade ${unit.number || unit.name} reservada por 48h!`);
    };

    const handleMakeProposal = (unit: BrokerUnit) => {
        setSelectedUnit(unit);
        setShowSimulator(true);
        setCurrentTab('propostas');
    };

    const handleSubmitProposal = async (proposal: Partial<BrokerProposal>) => {
        try {
            const savedProposal = await brokerService.saveProposal(proposal);
            setProposals(prev => [savedProposal, ...prev.filter(p => !p.id?.startsWith('prop-'))]);
            setShowSimulator(false);
            setSelectedUnit(null);
            alert('Proposta enviada com sucesso! A incorporadora irá analisar.');
        } catch (error) {
            console.error("Erro ao salvar proposta:", error);
            alert('Erro ao enviar proposta. Por favor, tente novamente.');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                            Portal do Corretor
                        </h1>
                        {(profile?.role === UserProfile.ADMIN || profile?.role === UserProfile.DEVELOPER || profile?.group === ProfileGroup.DEVELOPER || profile?.role === 'ADMINISTRADOR' || profile?.group === 'DESENVOLVEDOR') && (
                            <select
                                onChange={(e) => {
                                    const broker = allBrokers.find(b => b.id === e.target.value);
                                    setSelectedAdminBroker(broker || null);
                                }}
                                className="bg-amber-50 border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-1.5 focus:ring-0 cursor-pointer shadow-sm hover:bg-amber-100 transition-colors"
                                value={selectedAdminBroker?.id || ''}
                            >
                                <option value="">Impersonar Corretor</option>
                                {allBrokers.map(b => (
                                    <option key={b.id} value={b.id}>{b.name} ({b.email})</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">
                        {effectiveBrokerEmail ? `Olá, ${effectiveBrokerEmail.split('@')[0]}` : 'Bem-vindo'} • Estoque, propostas, leads e comissões em tempo real.
                    </p>
                </div>

                {organizations.length > 1 && (
                    <div className="flex flex-col gap-1.5 min-w-[300px]">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Selecione a Organização</label>
                        <select
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value)}
                            className="bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-2xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 shadow-sm outline-none appearance-none cursor-pointer"
                        >
                            {organizations.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Unidades Disponíveis" value={stats.available} subtext={`de ${units.length} unidades`} icon={Building2} color="indigo" />
                <StatCard title="Propostas Enviadas" value={stats.sent} subtext="Aguardando análise" icon={Send} color="blue" />
                <StatCard title="Propostas Aprovadas" value={stats.approved} subtext="Vendas confirmadas" icon={CheckCircle2} color="emerald" />
                <StatCard title="Comissão Acumulada" value={formatCurrency(stats.totalCommission)} subtext="5% sobre aprovadas" icon={DollarSign} color="amber" />
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { setCurrentTab(tab.id); setShowSimulator(false); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${currentTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {currentTab === 'estoque' && !showSimulator && (
                <div className="space-y-6">
                    {/* Filtros: Venda/Locação e Empreendimento */}
                    <div className="flex flex-col xl:flex-row gap-4 justify-between xl:items-center">
                        <div className="flex bg-gray-100 p-1 rounded-2xl w-fit shrink-0">
                            {[
                                { id: 'SALE', label: 'Vendas' },
                                { id: 'RENTAL', label: 'Locação' },
                                { id: 'BOTH', label: 'Todos' }
                            ].map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPurpose(p.id as any)}
                                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedPurpose === p.id
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {buildings.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 shrink-0">Empreendimento:</span>
                                <div className="flex bg-gray-100 p-1 rounded-2xl min-w-max">
                                    <button
                                        onClick={() => setSelectedBuildingId('all')}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedBuildingId === 'all'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                            }`}
                                    >
                                        Geral
                                    </button>
                                    {buildings.map((b) => (
                                        <button
                                            key={b.id}
                                            onClick={() => setSelectedBuildingId(b.id)}
                                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all max-w-[150px] truncate ${selectedBuildingId === b.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                                }`}
                                            title={b.name}
                                        >
                                            {b.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <PropertyUnitMap
                        units={displayUnits}
                        parentProperty={buildings.find(b => b.id === selectedBuildingId)}
                        deals={[
                            ...commercialDeals,
                            ...proposals.map(p => ({
                                ...p,
                                status: p.status === 'ENVIADA' ? 'PENDING' : 
                                        p.status === 'APROVADA' ? 'COMPLETED' : 
                                        p.status === 'REJEITADA' ? 'CANCELLED' : 
                                        'IN_NEGOTIATION'
                            }))
                        ] as any}
                        onSelectUnit={handleMakeProposal}
                        onReserveUnit={handleReserve}
                    />
                </div>
            )}

            {currentTab === 'propostas' && showSimulator && selectedUnit && (
                <BrokerProposalSimulator
                    unit={selectedUnit}
                    brokerEmail={effectiveBrokerEmail || ''}
                    organizationId={initialOrgId || selectedOrgId || 'demo'}
                    onSubmitProposal={handleSubmitProposal}
                    onCancel={() => { setShowSimulator(false); setCurrentTab('estoque'); }}
                />
            )}

            {currentTab === 'propostas' && !showSimulator && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100">
                        <h3 className="text-lg font-black text-gray-900">Minhas Propostas</h3>
                        <p className="text-sm text-gray-400 mt-1">Histórico de propostas enviadas</p>
                    </div>

                    {myProposals.length === 0 ? (
                        <div className="text-center py-16">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">Nenhuma proposta enviada ainda.</p>
                            <p className="text-gray-300 text-sm mt-1">Selecione uma unidade no Estoque para criar uma proposta.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {myProposals.map((p, i) => {
                                const unit = units.find(u => u.id === p.property_id);
                                return (
                                    <div key={p.id || i} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                                <Building2 className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">
                                                    Unidade {unit?.number || unit?.name || '-'} • {unit?.block || 'Geral'}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {p.buyer_name} • {p.buyer_cpf}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-gray-900">{formatCurrency(p.total_value || 0)}</p>
                                            <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${p.status === 'ENVIADA' ? 'bg-blue-50 text-blue-600' :
                                                p.status === 'APROVADA' ? 'bg-emerald-50 text-emerald-600' :
                                                    p.status === 'REJEITADA' ? 'bg-red-50 text-red-600' :
                                                        'bg-gray-100 text-gray-500'
                                                }`}>
                                                {p.status}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {currentTab === 'leads' && (
                <BrokerLeadManager brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'comissoes' && (
                <BrokerCommissions brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'materiais' && (
                <BrokerMaterials organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}

            {currentTab === 'ranking' && (
                <BrokerRanking brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'treinamento' && (
                <BrokerTraining brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'agenda' && (
                <BrokerEvents brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'chat' && (
                <BrokerChat brokerEmail={effectiveBrokerEmail || ''} />
            )}

            {currentTab === 'analytics' && (
                <BrokerAnalytics organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}

            {currentTab === 'saude' && (
                <BrokerHealthPanel organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}

            {currentTab === 'integracoes' && (
                <BrokerIntegrations organizationId={initialOrgId || selectedOrgId || 'demo'} />
            )}
        </div>
    );
};

export default BrokerPortal;
