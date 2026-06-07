import React from 'react';
import {
    MapPin, Building2, TrendingUp, Loader2, AlertCircle,
    ExternalLink, Globe,
} from 'lucide-react';
import {
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS,
} from '../../services/investorPortalService';
import {
    type PublicMarketplace,
    type PublicOpportunity,
    publicMarketplaceService,
} from '../../services/publicMarketplaceService';
import { fmtBRL, fmtPct } from '../../utils/format';
import PublicOpportunityDetail from './PublicOpportunityDetail';

interface Props {
    slug: string;
}

const PublicMarketplaceView: React.FC<Props> = ({ slug }) => {
    const [data, setData] = React.useState<PublicMarketplace | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [selected, setSelected] = React.useState<PublicOpportunity | null>(null);

    React.useEffect(() => {
        setLoading(true);
        setError(null);
        publicMarketplaceService.getMarketplace(slug)
            .then(setData)
            .catch(err => setError(err?.message ?? 'Erro ao carregar'))
            .finally(() => setLoading(false));
    }, [slug]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Carregando oportunidades...</span>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="text-center max-w-sm">
                    <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-lg font-black text-gray-700 mb-2">Página não encontrada</h2>
                    <p className="text-sm text-gray-400">
                        {error === 'organization_not_found'
                            ? 'Esta empresa não tem uma página pública configurada.'
                            : 'Não foi possível carregar as oportunidades. Tente novamente mais tarde.'}
                    </p>
                </div>
            </div>
        );
    }

    const { organization: org, opportunities } = data;

    if (selected) {
        return (
            <PublicOpportunityDetail
                opportunity={selected}
                organization={org}
                onBack={() => { setSelected(null); window.scrollTo(0, 0); }}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Header da organização ─────────────────────────────── */}
            <header className="bg-[#0B1727] text-white">
                <div className="max-w-5xl mx-auto px-6 py-8 flex items-center gap-6">
                    {org.logo_url ? (
                        <img
                            src={org.logo_url}
                            alt={org.name}
                            className="w-16 h-16 rounded-2xl object-contain bg-white/10 p-1 flex-shrink-0"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                            <Building2 className="w-8 h-8 text-white/50" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black leading-tight">{org.name}</h1>
                        <p className="text-blue-200 text-sm mt-1">Oportunidades de Investimento</p>
                        {org.website && (
                            <a
                                href={org.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-white mt-2 transition-colors"
                            >
                                <Globe className="w-3 h-3" />
                                {org.website.replace(/^https?:\/\//, '')}
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                    </div>
                    <div className="hidden sm:block text-right">
                        <p className="text-3xl font-black text-white">{opportunities.length}</p>
                        <p className="text-xs text-blue-300 uppercase tracking-widest">
                            oportunidade{opportunities.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </header>

            {/* ── Grid de oportunidades ─────────────────────────────── */}
            <main className="max-w-5xl mx-auto px-6 py-10">
                {opportunities.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-gray-100">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-lg font-black text-gray-400">Nenhuma oportunidade disponível no momento</p>
                        <p className="text-sm text-gray-300 mt-1">Volte em breve para conferir as novidades.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {opportunities.map(opp => {
                            const coverPhoto = opp.photos?.[0]
                                ? publicMarketplaceService.resolvePhotoUrls([opp.photos[0]])[0]?.url
                                : null;
                            const heroSrc = opp.thumbnail_url || coverPhoto;

                            return (
                                <button
                                    key={opp.id}
                                    onClick={() => setSelected(opp)}
                                    className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all text-left"
                                >
                                    {/* Thumbnail */}
                                    <div className="h-44 bg-gradient-to-br from-[#0B1727] to-blue-900 relative overflow-hidden flex-shrink-0">
                                        {heroSrc ? (
                                            <img
                                                src={heroSrc}
                                                alt={opp.title}
                                                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                                            />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Building2 className="w-12 h-12 text-white/20" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                                        {opp.status && (
                                            <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[opp.status]}`}>
                                                {OPPORTUNITY_STATUS_LABELS[opp.status]}
                                            </span>
                                        )}
                                        {opp.photos && opp.photos.length > 0 && (
                                            <span className="absolute bottom-2 right-3 text-[10px] text-white/70 font-bold">
                                                📷 {opp.photos.length}
                                            </span>
                                        )}
                                    </div>

                                    {/* Conteúdo */}
                                    <div className="p-5">
                                        <h3 className="font-black text-gray-900 text-base leading-tight mb-1 line-clamp-2 group-hover:text-blue-700 transition-colors">
                                            {opp.title}
                                        </h3>
                                        {opp.subtitle && (
                                            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{opp.subtitle}</p>
                                        )}

                                        <div className="flex flex-wrap gap-2 text-[10px] text-gray-400 mb-4">
                                            {(opp.location_city || opp.location_state) && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" />
                                                    {[opp.location_city, opp.location_state].filter(Boolean).join(', ')}
                                                </span>
                                            )}
                                            {opp.opportunity_type && (
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="w-3 h-3" />
                                                    {OPPORTUNITY_TYPE_LABELS[opp.opportunity_type]}
                                                </span>
                                            )}
                                        </div>

                                        {/* KPIs */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {opp.vgv != null && (
                                                <div className="bg-blue-50 rounded-xl p-2.5">
                                                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-wider">VGV</p>
                                                    <p className="text-sm font-black text-blue-900 mt-0.5">{fmtBRL(opp.vgv)}</p>
                                                </div>
                                            )}
                                            {opp.roi_pct != null && (
                                                <div className="bg-emerald-50 rounded-xl p-2.5">
                                                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                                                        <TrendingUp className="w-2.5 h-2.5" /> ROI
                                                    </p>
                                                    <p className="text-sm font-black text-emerald-800 mt-0.5">{fmtPct(opp.roi_pct)}</p>
                                                </div>
                                            )}
                                            {opp.ticket_min != null && (
                                                <div className="bg-gray-50 rounded-xl p-2.5 col-span-2">
                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Ticket mínimo</p>
                                                    <p className="text-sm font-black text-gray-800 mt-0.5">{fmtBRL(opp.ticket_min)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* ── Footer ── */}
            <footer className="text-center py-8 text-xs text-gray-400 border-t border-gray-100">
                Powered by <span className="font-bold text-gray-600">OrçaCloud</span>
            </footer>
        </div>
    );
};

export default PublicMarketplaceView;
