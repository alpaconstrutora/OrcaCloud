import React from 'react';
import { Users, ChevronDown, Mail, Phone, Clock } from 'lucide-react';
import {
    OpportunityInterest, InterestStage, InvestorOpportunity,
    INTEREST_STAGE_LABELS, INTEREST_STAGE_COLORS, INTEREST_ROLE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';

interface Props {
    organizationId: string;
    opportunities: InvestorOpportunity[];
}

const STAGES: InterestStage[] = ['lead', 'interesse', 'reuniao', 'proposta', 'negociacao', 'fechado'];

const InterestsPanel: React.FC<Props> = ({ organizationId, opportunities }) => {
    const [interests, setInterests] = React.useState<OpportunityInterest[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [filterOpp, setFilterOpp] = React.useState<string>('all');
    const [updating, setUpdating] = React.useState<string | null>(null);

    React.useEffect(() => {
        setLoading(true);
        investorPortalService.listInterests(organizationId)
            .then(setInterests)
            .catch(err => console.error('Erro ao carregar interesses', err))
            .finally(() => setLoading(false));
    }, [organizationId]);

    const handleStageChange = async (id: string, stage: InterestStage) => {
        setUpdating(id);
        try {
            await investorPortalService.updateInterestStage(id, stage);
            setInterests(prev => prev.map(i => i.id === id ? { ...i, stage } : i));
        } catch (err) {
            console.error('Erro ao atualizar estágio', err);
        } finally {
            setUpdating(null);
        }
    };

    const filtered = filterOpp === 'all'
        ? interests
        : interests.filter(i => i.opportunity_id === filterOpp);

    const byStage = STAGES.reduce<Record<InterestStage, OpportunityInterest[]>>(
        (acc, s) => ({ ...acc, [s]: filtered.filter(i => (i.stage ?? 'lead') === s) }),
        {} as Record<InterestStage, OpportunityInterest[]>,
    );

    const oppTitle = (id: string) => opportunities.find(o => o.id === id)?.title ?? '—';

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                Carregando interesses...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Cabeçalho + filtro */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-black text-gray-900">Interesses Recebidos</h3>
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-black rounded-full">
                        {filtered.length}
                    </span>
                </div>
                <select
                    value={filterOpp}
                    onChange={e => setFilterOpp(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 max-w-[240px]"
                >
                    <option value="all">Todas as oportunidades</option>
                    {opportunities.map(o => (
                        <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                </select>
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl">
                    <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">Nenhuma manifestação recebida ainda</p>
                    <p className="text-xs text-gray-300 mt-1">Os interesses aparecerão aqui quando alguém manifestar interesse</p>
                </div>
            ) : (
                /* Kanban por estágio */
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {STAGES.map(stage => {
                        const items = byStage[stage];
                        const colors = INTEREST_STAGE_COLORS[stage];
                        return (
                            <div key={stage} className={`rounded-2xl border p-4 space-y-3 ${colors.bg} ${colors.border}`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-black uppercase tracking-widest ${colors.text}`}>
                                        {INTEREST_STAGE_LABELS[stage]}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${colors.text} bg-white/60`}>
                                        {items.length}
                                    </span>
                                </div>

                                {items.map(item => (
                                    <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">{item.contact_name}</p>
                                            <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded-full mt-1">
                                                {INTEREST_ROLE_LABELS[item.role]}
                                            </span>
                                        </div>

                                        {filterOpp === 'all' && (
                                            <p className="text-xs text-gray-400 font-medium truncate">
                                                {oppTitle(item.opportunity_id)}
                                            </p>
                                        )}

                                        <div className="space-y-1 text-xs text-gray-500">
                                            {item.contact_email && (
                                                <a href={`mailto:${item.contact_email}`} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                                                    <Mail className="w-3 h-3 flex-shrink-0" />
                                                    <span className="truncate">{item.contact_email}</span>
                                                </a>
                                            )}
                                            {item.contact_phone && (
                                                <a href={`tel:${item.contact_phone}`} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                                                    <Phone className="w-3 h-3 flex-shrink-0" />
                                                    {item.contact_phone}
                                                </a>
                                            )}
                                            {item.created_at && (
                                                <span className="flex items-center gap-1.5 text-gray-400">
                                                    <Clock className="w-3 h-3 flex-shrink-0" />
                                                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                                </span>
                                            )}
                                        </div>

                                        {item.message && (
                                            <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-2 leading-relaxed">
                                                "{item.message}"
                                            </p>
                                        )}

                                        {/* Avançar estágio */}
                                        <div className="relative">
                                            <select
                                                value={item.stage ?? 'lead'}
                                                disabled={updating === item.id}
                                                onChange={e => handleStageChange(item.id!, e.target.value as InterestStage)}
                                                className="w-full appearance-none pl-3 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 cursor-pointer disabled:opacity-50"
                                            >
                                                {STAGES.map(s => (
                                                    <option key={s} value={s}>{INTEREST_STAGE_LABELS[s]}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default InterestsPanel;
