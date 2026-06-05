import React from 'react';
import {
    X, MapPin, TrendingUp, BarChart3, Ruler, Calendar,
    Building2, CheckCircle2, ChevronRight, Handshake,
} from 'lucide-react';
import {
    InvestorOpportunity, InterestRole,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_STATUS_COLORS,
    OPPORTUNITY_TYPE_LABELS, INTEREST_ROLE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';

interface Props {
    opportunity: InvestorOpportunity;
    organizationId: string;
    onClose: () => void;
}

const fmtBRL = (v: number | null | undefined) => {
    if (v == null) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
};
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
const fmtM2 = (v: number | null | undefined) => (v == null ? '—' : `${new Intl.NumberFormat('pt-BR').format(v)} m²`);

const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

type FormStep = 'pitch' | 'form' | 'success';

const OpportunityDetail: React.FC<Props> = ({ opportunity: op, organizationId, onClose }) => {
    const [step, setStep] = React.useState<FormStep>('pitch');
    const [saving, setSaving] = React.useState(false);
    const [interest, setInterest] = React.useState({
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        role: 'investidor' as InterestRole,
        message: '',
    });

    const handleInterestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!interest.contact_name.trim()) return;
        setSaving(true);
        try {
            await investorPortalService.addInterest({
                organization_id: organizationId,
                opportunity_id: op.id!,
                ...interest,
            });
            setStep('success');
        } catch (err) {
            console.error('Erro ao registrar interesse', err);
            alert('Erro ao registrar interesse. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const hasFinancials = op.vgv || op.roi_pct != null || op.tir_pct != null || op.cost_estimate;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Thumbnail / Hero ─────────────────────────────────── */}
                {op.thumbnail_url ? (
                    <div className="relative h-52 rounded-t-3xl overflow-hidden">
                        <img src={op.thumbnail_url} alt={op.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 bg-black/30 hover:bg-black/50 text-white rounded-xl transition-colors backdrop-blur-sm"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        {op.status && (
                            <span className={`absolute bottom-4 left-6 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                {OPPORTUNITY_STATUS_LABELS[op.status]}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="h-16 bg-[#0B1727] rounded-t-3xl flex items-center justify-end px-6">
                        <button onClick={onClose} className="p-2 text-white/50 hover:text-white rounded-xl transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {step === 'pitch' && (
                    <div className="p-8 space-y-8">
                        {/* Header executivo */}
                        <div>
                            {!op.thumbnail_url && op.status && (
                                <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3 ${OPPORTUNITY_STATUS_COLORS[op.status]}`}>
                                    {OPPORTUNITY_STATUS_LABELS[op.status]}
                                </span>
                            )}
                            <h2 className="text-3xl font-black text-gray-900 leading-tight">{op.title}</h2>
                            {op.subtitle && <p className="text-gray-500 mt-2 text-sm leading-relaxed">{op.subtitle}</p>}

                            <div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
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
                                        Início previsto: {new Date(op.expected_start + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* KPIs financeiros */}
                        {hasFinancials && (
                            <div>
                                <div className="flex items-center gap-2 mb-4">
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

                        {/* Dados técnicos */}
                        {(op.land_area_m2 || op.built_area_m2 || op.floors) && (
                            <div>
                                <div className="flex items-center gap-2 mb-4">
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

                        {/* CTA */}
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
                    </div>
                )}

                {step === 'form' && (
                    <div className="p-8">
                        <div className="mb-6">
                            <button
                                onClick={() => setStep('pitch')}
                                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-3"
                            >
                                ← Voltar
                            </button>
                            <h3 className="text-xl font-black text-gray-900">Manifestar Interesse</h3>
                            <p className="text-sm text-gray-500 mt-1">{op.title}</p>
                        </div>

                        <form onSubmit={handleInterestSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Nome completo *</label>
                                <input
                                    type="text"
                                    required
                                    value={interest.contact_name}
                                    onChange={e => setInterest(p => ({ ...p, contact_name: e.target.value }))}
                                    placeholder="Seu nome"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">E-mail</label>
                                    <input
                                        type="email"
                                        value={interest.contact_email}
                                        onChange={e => setInterest(p => ({ ...p, contact_email: e.target.value }))}
                                        placeholder="seu@email.com"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Telefone / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={interest.contact_phone}
                                        onChange={e => setInterest(p => ({ ...p, contact_phone: e.target.value }))}
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
                                            onClick={() => setInterest(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${interest.role === r
                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
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
                                    value={interest.message}
                                    onChange={e => setInterest(p => ({ ...p, message: e.target.value }))}
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
                                <button
                                    type="button"
                                    onClick={() => setStep('pitch')}
                                    className="px-6 py-3 text-gray-500 hover:text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors"
                                >
                                    Voltar
                                </button>
                            </div>
                        </form>
                    </div>
                )}

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
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-700 transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OpportunityDetail;
