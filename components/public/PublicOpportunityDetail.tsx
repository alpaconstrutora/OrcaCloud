import React from 'react';
import {
    X, MapPin, TrendingUp, BarChart3, Ruler, Calendar,
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
    publicMarketplaceService,
} from '../../services/publicMarketplaceService';
import ScenarioComparison from '../investor/ScenarioComparison';
import PhotoGallery from '../investor/PhotoGallery';
import { fmtBRL, fmtPct, fmtM2 } from '../../utils/format';

interface Props {
    opportunity: PublicOpportunity;
    onClose: () => void;
}

type Tab = 'pitch' | 'cenarios' | 'fotos';
type Step = 'view' | 'form' | 'success';

const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

const PublicOpportunityDetail: React.FC<Props> = ({ opportunity: op, onClose }) => {
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

    const hasFinancials = op.vgv || op.roi_pct != null || op.tir_pct != null || op.cost_estimate;
    const hasScenarios  = !!(op.vgv && op.cost_estimate);
    const photos        = publicMarketplaceService.resolvePhotoUrls(op.photos ?? []);

    const TABS: { id: Tab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        ...(hasScenarios      ? [{ id: 'cenarios' as Tab, label: 'Viabilidade' }] : []),
        ...(photos.length > 0 ? [{ id: 'fotos'    as Tab, label: 'Fotos' }]      : []),
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

    const CTA = (
        <div className="flex gap-3 pt-2">
            <button
                onClick={() => setStep('form')}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-[#0B1727] hover:bg-blue-900 text-white font-bold rounded-2xl transition-all shadow-xl"
            >
                <Handshake className="w-4 h-4" />
                Manifestar Interesse
                <ChevronRight className="w-4 h-4" />
            </button>
            <button
                onClick={onClose}
                className="px-6 py-4 text-gray-500 hover:text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors"
            >
                Fechar
            </button>
        </div>
    );

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Hero */}
                {op.thumbnail_url ? (
                    <div className="relative h-48 rounded-t-3xl overflow-hidden flex-shrink-0">
                        <img src={op.thumbnail_url} alt={op.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/30 hover:bg-black/50 text-white rounded-xl transition-colors backdrop-blur-sm">
                            <X className="w-4 h-4" />
                        </button>
                        {op.status && (
                            <span className={`absolute bottom-4 left-6 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                {OPPORTUNITY_STATUS_LABELS[op.status]}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="h-14 bg-[#0B1727] rounded-t-3xl flex items-center justify-end px-6 flex-shrink-0">
                        <button onClick={onClose} className="p-2 text-white/50 hover:text-white rounded-xl transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {step === 'view' && (
                    <div className="flex flex-col">
                        {/* Header */}
                        <div className="px-8 pt-6 pb-4">
                            {!op.thumbnail_url && op.status && (
                                <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                    {OPPORTUNITY_STATUS_LABELS[op.status]}
                                </span>
                            )}
                            <h2 className="text-2xl font-black text-gray-900 leading-tight">{op.title}</h2>
                            {op.subtitle && <p className="text-gray-500 mt-1.5 text-sm leading-relaxed">{op.subtitle}</p>}
                            <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
                                {(op.location_city || op.location_state) && (
                                    <span className="flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5" />
                                        {[op.location_city, op.location_state].filter(Boolean).join(', ')}
                                    </span>
                                )}
                                {op.opportunity_type && (
                                    <span className="flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5" />
                                        {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                    </span>
                                )}
                                {op.expected_start && (
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        Início: {new Date(op.expected_start + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                                {op.duration_months && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {op.duration_months} meses
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        {TABS.length > 1 && (
                            <div className="px-8 pb-2 flex gap-1 border-b border-gray-100">
                                {TABS.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`px-4 py-2 rounded-t-xl text-xs font-bold transition-all ${tab === t.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* ── ABA: Detalhes ── */}
                        {tab === 'pitch' && (
                            <div className="px-8 py-6 space-y-6">
                                {hasFinancials && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <BarChart3 className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Indicadores</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {op.vgv != null && (
                                                <div className="bg-blue-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">VGV</p>
                                                    <p className="text-xl font-black text-blue-900">{fmtBRL(op.vgv)}</p>
                                                </div>
                                            )}
                                            {op.roi_pct != null && (
                                                <div className="bg-emerald-50 rounded-2xl p-4">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">ROI estimado</p>
                                                    </div>
                                                    <p className="text-xl font-black text-emerald-800">{fmtPct(op.roi_pct)}</p>
                                                </div>
                                            )}
                                            {op.tir_pct != null && (
                                                <div className="bg-indigo-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider mb-1">TIR estimada</p>
                                                    <p className="text-xl font-black text-indigo-900">{fmtPct(op.tir_pct)}</p>
                                                </div>
                                            )}
                                            {op.cost_estimate != null && (
                                                <div className="bg-amber-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Custo estimado</p>
                                                    <p className="text-xl font-black text-amber-900">{fmtBRL(op.cost_estimate)}</p>
                                                </div>
                                            )}
                                            {op.cost_per_m2 != null && (
                                                <div className="bg-gray-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Custo / m²</p>
                                                    <p className="text-xl font-black text-gray-800">{fmtBRL(op.cost_per_m2)}</p>
                                                </div>
                                            )}
                                            {op.ticket_min != null && (
                                                <div className="bg-gray-50 rounded-2xl p-4">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Ticket mínimo</p>
                                                    <p className="text-xl font-black text-gray-800">{fmtBRL(op.ticket_min)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {(op.land_area_m2 || op.built_area_m2 || op.floors) && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <Ruler className="w-4 h-4 text-blue-600" />
                                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Dados técnicos</span>
                                        </div>
                                        <div className="flex flex-wrap gap-6 text-sm">
                                            {op.land_area_m2 && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Terreno</p>
                                                    <p className="font-bold text-gray-800 mt-0.5">{fmtM2(op.land_area_m2)}</p>
                                                </div>
                                            )}
                                            {op.built_area_m2 && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Área construída</p>
                                                    <p className="font-bold text-gray-800 mt-0.5">{fmtM2(op.built_area_m2)}</p>
                                                </div>
                                            )}
                                            {op.floors && (
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Pavimentos</p>
                                                    <p className="font-bold text-gray-800 mt-0.5">{op.floors}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {CTA}
                            </div>
                        )}

                        {/* ── ABA: Viabilidade ── */}
                        {tab === 'cenarios' && hasScenarios && (
                            <div className="px-8 py-6 space-y-6">
                                <ScenarioComparison opportunity={op} />
                                {CTA}
                            </div>
                        )}

                        {/* ── ABA: Fotos ── */}
                        {tab === 'fotos' && (
                            <div className="px-8 py-6 space-y-4">
                                {photos.length > 0 ? (
                                    <>
                                        <PhotoGallery photos={photos} />
                                        <p className="text-xs text-gray-400 text-center">
                                            {photos.length} foto{photos.length !== 1 ? 's' : ''}
                                        </p>
                                    </>
                                ) : (
                                    <div className="text-center py-12 bg-gray-50 rounded-2xl">
                                        <Image className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-sm font-bold text-gray-400">Nenhuma foto disponível</p>
                                    </div>
                                )}
                                {CTA}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Formulário de interesse ── */}
                {step === 'form' && (
                    <div className="p-8">
                        <div className="mb-6">
                            <button onClick={() => setStep('view')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-3">
                                ← Voltar
                            </button>
                            <h3 className="text-xl font-black text-gray-900">Manifestar Interesse</h3>
                            <p className="text-sm text-gray-500 mt-1">{op.title}</p>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Nome completo *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="Seu nome"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">E-mail</label>
                                    <input
                                        type="email"
                                        value={form.email ?? ''}
                                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                                        placeholder="seu@email.com"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Telefone / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={form.phone ?? ''}
                                        onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                        placeholder="(00) 00000-0000"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Perfil</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setForm(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${form.role === r ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            {INTEREST_ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Mensagem (opcional)</label>
                                <textarea
                                    rows={3}
                                    value={form.message ?? ''}
                                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Conte um pouco sobre seu interesse ou proposta..."
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                                >
                                    {saving ? 'Enviando...' : 'Enviar manifestação'}
                                </button>
                                <button type="button" onClick={() => setStep('view')} className="px-6 py-3 text-gray-500 hover:text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors">
                                    Voltar
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── Sucesso ── */}
                {step === 'success' && (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-2">Interesse registrado!</h3>
                        <p className="text-gray-500 text-sm mb-8">
                            Sua manifestação de interesse em <strong>{op.title}</strong> foi recebida.
                            Nossa equipe entrará em contato em breve.
                        </p>
                        <button onClick={onClose} className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-700 transition-colors">
                            Fechar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicOpportunityDetail;
