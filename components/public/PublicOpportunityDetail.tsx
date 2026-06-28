import React from 'react';
import {
    ArrowLeft, MapPin, TrendingUp, BarChart3, Ruler, Calendar,
    Building2, CheckCircle2, ChevronRight, Handshake, Clock, Image,
} from 'lucide-react';
import {
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS, INTEREST_ROLE_LABELS,
    type InterestRole,
} from '../../services/investorPortalService';
import {
    type PublicOpportunity,
    type SubmitInterestPayload,
    type PublicOrganization,
    publicMarketplaceService,
} from '../../services/publicMarketplaceService';
import ScenarioComparison from '../investor/ScenarioComparison';
import PhotoGallery from '../investor/PhotoGallery';
import { fmtBRL, fmtPct, fmtM2 } from '../../utils/format';

interface Props {
    opportunity: PublicOpportunity;
    organization: PublicOrganization;
    onBack: () => void;
}

type Tab = 'pitch' | 'cenarios' | 'fotos';
type Step = 'view' | 'form' | 'success';

const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

const PublicOpportunityDetail: React.FC<Props> = ({ opportunity: op, organization: org, onBack }) => {
    const [tab, setTab] = React.useState<Tab>('pitch');
    const [step, setStep] = React.useState<Step>('view');
    const [saving, setSaving] = React.useState(false);
    const [form, setForm] = React.useState<SubmitInterestPayload>({
        opportunity_id: op.id!,
        name: '',
        email: '',
        phone: '',
        role: 'investidor',
        message: '',
    });

    React.useEffect(() => { window.scrollTo(0, 0); }, []);

    const hasFinancials = op.vgv || op.roi_pct != null || op.tir_pct != null || op.cost_estimate;
    const hasScenarios  = !!(op.vgv && op.cost_estimate);
    const photos        = publicMarketplaceService.resolvePhotoUrls(op.photos ?? []);

    const TABS: { id: Tab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        ...(hasScenarios      ? [{ id: 'cenarios' as Tab, label: 'Viabilidade' }] : []),
        ...(photos.length > 0 ? [{ id: 'fotos'    as Tab, label: `Fotos (${photos.length})` }] : []),
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            await publicMarketplaceService.submitInterest(form);
            setStep('success');
        } catch (err) {
            console.error('Erro ao registrar interesse', err);
            alert('Erro ao registrar interesse. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Navbar ── */}
            <nav className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {org.name}
                    </button>
                    {op.status && (
                        <span className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                            {OPPORTUNITY_STATUS_LABELS[op.status]}
                        </span>
                    )}
                </div>
            </nav>

            {/* ── Hero ── */}
            {op.thumbnail_url && (
                <div className="w-full h-72 sm:h-96 overflow-hidden relative">
                    <img
                        src={op.thumbnail_url}
                        alt={op.title}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                </div>
            )}

            <div className="max-w-4xl mx-auto px-6 py-8">
                {step === 'view' && (
                    <>
                        {/* ── Título ── */}
                        <div className="mb-8">
                            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">{op.title}</h1>
                            {op.subtitle && (
                                <p className="text-gray-500 mt-2 text-base leading-relaxed">{op.subtitle}</p>
                            )}
                            <div className="flex flex-wrap gap-5 mt-4 text-sm text-gray-400">
                                {(op.location_city || op.location_state) && (
                                    <span className="flex items-center gap-1.5">
                                        <MapPin className="w-4 h-4" />
                                        {[op.location_city, op.location_state].filter(Boolean).join(', ')}
                                    </span>
                                )}
                                {op.opportunity_type && (
                                    <span className="flex items-center gap-1.5">
                                        <Building2 className="w-4 h-4" />
                                        {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                    </span>
                                )}
                                {op.expected_start && (
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        Início: {new Date(op.expected_start + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                                {op.duration_months && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="w-4 h-4" />
                                        {op.duration_months} meses
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* ── Tabs ── */}
                        {TABS.length > 1 && (
                            <div className="flex gap-1 border-b border-gray-200 mb-8">
                                {TABS.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`px-5 py-3 text-sm font-bold transition-all border-b-2 -mb-px ${
                                            tab === t.id
                                                ? 'text-blue-600 border-blue-600'
                                                : 'text-gray-400 border-transparent hover:text-gray-600'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ── ABA: Detalhes ── */}
                        {tab === 'pitch' && (
                            <div className="space-y-8">
                                {hasFinancials && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <BarChart3 className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Indicadores</span>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {op.vgv != null && (
                                                <div className="bg-blue-50 rounded-2xl p-5">
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">VGV</p>
                                                    <p className="text-2xl font-black text-blue-900">{fmtBRL(op.vgv)}</p>
                                                </div>
                                            )}
                                            {op.roi_pct != null && (
                                                <div className="bg-emerald-50 rounded-2xl p-5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">ROI estimado</p>
                                                    </div>
                                                    <p className="text-2xl font-black text-emerald-800">{fmtPct(op.roi_pct)}</p>
                                                </div>
                                            )}
                                            {op.tir_pct != null && (
                                                <div className="bg-indigo-50 rounded-2xl p-5">
                                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider mb-1">TIR estimada</p>
                                                    <p className="text-2xl font-black text-indigo-900">{fmtPct(op.tir_pct)}</p>
                                                </div>
                                            )}
                                            {op.cost_estimate != null && (
                                                <div className="bg-amber-50 rounded-2xl p-5">
                                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Custo estimado</p>
                                                    <p className="text-2xl font-black text-amber-900">{fmtBRL(op.cost_estimate)}</p>
                                                </div>
                                            )}
                                            {op.cost_per_m2 != null && (
                                                <div className="bg-gray-50 rounded-2xl p-5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Custo / m²</p>
                                                    <p className="text-2xl font-black text-gray-800">{fmtBRL(op.cost_per_m2)}</p>
                                                </div>
                                            )}
                                            {op.ticket_min != null && (
                                                <div className="bg-gray-50 rounded-2xl p-5">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Ticket mínimo</p>
                                                    <p className="text-2xl font-black text-gray-800">{fmtBRL(op.ticket_min)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {(op.land_area_m2 || op.built_area_m2 || op.floors) && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-4">
                                            <Ruler className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Dados técnicos</span>
                                        </div>
                                        <div className="flex flex-wrap gap-8">
                                            {op.land_area_m2 && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Terreno</p>
                                                    <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtM2(op.land_area_m2)}</p>
                                                </div>
                                            )}
                                            {op.built_area_m2 && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Área construída</p>
                                                    <p className="text-lg font-bold text-gray-800 mt-0.5">{fmtM2(op.built_area_m2)}</p>
                                                </div>
                                            )}
                                            {op.floors && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pavimentos</p>
                                                    <p className="text-lg font-bold text-gray-800 mt-0.5">{op.floors}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => setStep('form')}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl text-base"
                                >
                                    <Handshake className="w-5 h-5" />
                                    Manifestar Interesse
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {/* ── ABA: Viabilidade ── */}
                        {tab === 'cenarios' && hasScenarios && (
                            <div className="space-y-8">
                                <ScenarioComparison opportunity={op} />
                                <button
                                    onClick={() => setStep('form')}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl text-base"
                                >
                                    <Handshake className="w-5 h-5" />
                                    Manifestar Interesse
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}

                        {/* ── ABA: Fotos ── */}
                        {tab === 'fotos' && (
                            <div className="space-y-6">
                                {photos.length > 0 ? (
                                    <>
                                        <PhotoGallery photos={photos} />
                                        <p className="text-xs text-gray-400 text-center">
                                            {photos.length} foto{photos.length !== 1 ? 's' : ''}
                                        </p>
                                    </>
                                ) : (
                                    <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
                                        <Image className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-sm font-bold text-gray-400">Nenhuma foto disponível</p>
                                    </div>
                                )}
                                <button
                                    onClick={() => setStep('form')}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl text-base"
                                >
                                    <Handshake className="w-5 h-5" />
                                    Manifestar Interesse
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* ── Formulário de interesse ── */}
                {step === 'form' && (
                    <div className="max-w-lg">
                        <button onClick={() => setStep('view')} className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-6">
                            <ArrowLeft className="w-4 h-4" /> Voltar
                        </button>
                        <h2 className="text-2xl font-black text-gray-900 mb-1">Manifestar Interesse</h2>
                        <p className="text-sm text-gray-500 mb-8">{op.title}</p>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Nome completo *</label>
                                <input
                                    type="text" required
                                    value={form.name}
                                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Seu nome"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">E-mail</label>
                                    <input
                                        type="email"
                                        value={form.email ?? ''}
                                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                        placeholder="seu@email.com"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">Telefone / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={form.phone ?? ''}
                                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                        placeholder="(00) 00000-0000"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Perfil</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map(r => (
                                        <button
                                            key={r} type="button"
                                            onClick={() => setForm(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-button font-bold transition-all ${form.role === r ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            {INTEREST_ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-button font-bold text-gray-600 mb-1.5">Mensagem (opcional)</label>
                                <textarea
                                    rows={4}
                                    value={form.message ?? ''}
                                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Conte um pouco sobre seu interesse ou proposta..."
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <button
                                type="submit" disabled={saving}
                                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20 text-base"
                            >
                                {saving ? 'Enviando...' : 'Enviar manifestação'}
                            </button>
                        </form>
                    </div>
                )}

                {/* ── Sucesso ── */}
                {step === 'success' && (
                    <div className="max-w-md mx-auto text-center py-16">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 mb-3">Interesse registrado!</h2>
                        <p className="text-gray-500 mb-8">
                            Sua manifestação de interesse em <strong>{op.title}</strong> foi recebida.
                            Nossa equipe entrará em contato em breve.
                        </p>
                        <button
                            onClick={onBack}
                            className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-700 transition-colors"
                        >
                            Ver outras oportunidades
                        </button>
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <footer className="text-center py-8 text-xs text-gray-400 border-t border-gray-100 mt-12">
                Powered by <span className="font-bold text-gray-600">OrçaCloud</span>
            </footer>
        </div>
    );
};

export default PublicOpportunityDetail;
