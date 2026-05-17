import React, { useState } from 'react';
import { ImovibStudy } from '../types';
import { useImovibMath } from '../hooks/useImovibMath';
import { imovibService } from '../services/imovibService';
import { Leaf, Users, Shield, Award, CheckCircle2, ChevronDown, Gavel, DollarSign, TrendingUp, Percent } from 'lucide-react';

interface ImovibEsgReportFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

const AVAILABLE_CERTIFICATIONS = [
    'LEED (Ouro/Platina)',
    'AQUA-HQE',
    'EDGE',
    'Selo Casa Azul CAIXA',
    'GRESB',
    'Fitwel',
    'Procelifica'
];

const ImovibEsgReportForm: React.FC<ImovibEsgReportFormProps> = ({ study, onDataChanged }) => {
    const math = useImovibMath(study);

    // ESG State
    const [envScore, setEnvScore] = useState(study.esg_environmental_score ?? 3);
    const [socScore, setSocScore] = useState(study.esg_social_score ?? 3);
    const [govScore, setGovScore] = useState(study.esg_governance_score ?? 3);
    const [certs, setCerts] = useState<string[]>(study.esg_certifications || []);
    const [esgNotes, setEsgNotes] = useState(study.esg_notes || '');

    // ESG Initiatives Logic
    const DEFAULT_INITIATIVES: { id: string, name: string, category: 'E' | 'S' | 'G', cost: number, vgv_premium: number, funding_discount: number, active: boolean }[] = [
        { id: '1', name: 'Painéis Solares (Áreas Comuns)', category: 'E', cost: 150000, vgv_premium: 1.5, funding_discount: 0, active: false },
        { id: '2', name: 'Certificação EDGE / LEED', category: 'E', cost: 80000, vgv_premium: 0, funding_discount: 1.0, active: false },
        { id: '3', name: 'Revitalização de Praça Pública/Entorno', category: 'S', cost: 250000, vgv_premium: 2.0, funding_discount: 0, active: false },
        { id: '4', name: 'Gestão Inteligente de Resíduos', category: 'E', cost: 45000, vgv_premium: 0.5, funding_discount: 0, active: false },
        { id: '5', name: 'Auditoria Externa de Obra (Compliance)', category: 'G', cost: 60000, vgv_premium: 0, funding_discount: 0.5, active: false }
    ];

    const [initiatives, setInitiatives] = useState<{ id: string, name: string, category: 'E' | 'S' | 'G', cost: number, vgv_premium: number, funding_discount: number, active: boolean }[]>(
        study.esg_initiatives && study.esg_initiatives.length > 0 ? study.esg_initiatives : DEFAULT_INITIATIVES
    );

    // Committee State
    const [decision, setDecision] = useState<string>(study.committee_decision || 'draft');
    const [committeeNotes, setCommitteeNotes] = useState(study.committee_notes || '');

    const [isSaving, setIsSaving] = useState(false);

    // Calculate OrçaCloud Rating based on IRR vs basic hurdles 
    // Usually WACC/Hurdle is internal. Let's assume a baseline hurdle of 12% a.a real.
    const hurdleRate = 12;
    const projectIrr = isNaN(math.annualIrr) ? 0 : math.annualIrr;

    // Qualitative penalty: If average ESG score < 3, penalize rating
    const avgEsg = (envScore + socScore + govScore) / 3;

    let rating = 'N/A';
    let ratingColor = 'text-slate-400';
    let ratingBg = 'bg-slate-50';

    if (projectIrr > 0) {
        if (projectIrr > hurdleRate + 8) {
            rating = avgEsg >= 4 ? 'AAA' : 'AA';
            ratingColor = 'text-emerald-700';
            ratingBg = 'bg-emerald-100 border-emerald-200';
        } else if (projectIrr > hurdleRate + 4) {
            rating = avgEsg >= 3.5 ? 'AA' : 'A';
            ratingColor = 'text-emerald-600';
            ratingBg = 'bg-emerald-50 border-emerald-200';
        } else if (projectIrr >= hurdleRate) {
            rating = avgEsg >= 3 ? 'BBB' : 'BB';
            ratingColor = 'text-blue-600';
            ratingBg = 'bg-blue-50 border-blue-200';
        } else if (projectIrr > 0) {
            rating = 'C';
            ratingColor = 'text-rose-600';
            ratingBg = 'bg-rose-50 border-rose-200';
        }
    }

    const handleUpdate = async (field: keyof ImovibStudy, value: any) => {
        try {
            setIsSaving(true);
            await imovibService.updateStudy(study.id, { [field]: value });
            onDataChanged();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleCert = (cert: string) => {
        const newCerts = certs.includes(cert) ? certs.filter(c => c !== cert) : [...certs, cert];
        setCerts(newCerts);
        handleUpdate('esg_certifications', newCerts);
    };

    const toggleInitiative = (id: string) => {
        const newInis = initiatives.map(ini =>
            ini.id === id ? { ...ini, active: !ini.active } : ini
        );
        setInitiatives(newInis);

        // Auto-calculate scores based on active initiatives (Bonus feature)
        let bonusE = 0, bonusS = 0, bonusG = 0;
        newInis.filter(i => i.active).forEach(i => {
            if (i.category === 'E') bonusE++;
            if (i.category === 'S') bonusS++;
            if (i.category === 'G') bonusG++;
        });

        // Update raw scores slightly by boosting minimums if initiatives are taken
        const finalE = Math.min(5, Math.max(study.esg_environmental_score || 3, 3 + Math.floor(bonusE / 1.5)));
        const finalS = Math.min(5, Math.max(study.esg_social_score || 3, 3 + Math.floor(bonusS / 1.5)));
        const finalG = Math.min(5, Math.max(study.esg_governance_score || 3, 3 + Math.floor(bonusG / 1.5)));

        setEnvScore(finalE);
        setSocScore(finalS);
        setGovScore(finalG);

        try {
            setIsSaving(true);
            imovibService.updateStudy(study.id, {
                esg_initiatives: newInis,
                esg_environmental_score: finalE,
                esg_social_score: finalS,
                esg_governance_score: finalG
            }).then(() => onDataChanged());
        } finally {
            setIsSaving(false);
        }
    };

    // Helper for 1-5 rating UI
    const StarRating = ({ value, setter, field, icon: Icon, colorClass }: any) => (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    onClick={() => {
                        setter(star);
                        handleUpdate(field, star);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${star <= value ? colorClass : 'text-slate-200 hover:text-slate-300'
                        }`}
                >
                    <Icon className="w-6 h-6 fill-current" />
                </button>
            ))}
        </div>
    );

    return (
        <div className="space-y-6 pb-20 max-w-6xl mx-auto">

            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Award className="w-7 h-7 text-emerald-500" />
                        Parecer do Comitê & ESG
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 font-medium max-w-2xl">
                        Avaliação qualitativa institucional do projeto. O rating abaixo é gerado dinamicamente mesclando o prêmio de risco (TIR projetada) e as conformidades de impacto socioambiental (ESG).
                    </p>
                </div>

                {/* Dynamic Rating Card */}
                <div className={`px-8 py-4 rounded-2xl border ${ratingBg} flex items-center gap-6 shadow-sm`}>
                    <div>
                        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Rating OrçaCloud</span>
                        <span className={`block text-4xl font-black tracking-tighter ${ratingColor}`}>{rating}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <div className="space-y-6">
                    {/* ESG SCORING */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                        <h3 className="text-lg font-black text-slate-800 mb-6">Pilha ESG (Matriz Material)</h3>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                <div>
                                    <span className="font-bold text-emerald-900 block flex items-center gap-2">
                                        <Leaf className="w-4 h-4 text-emerald-600" />
                                        E - Environmental (Ambiental)
                                    </span>
                                    <span className="text-xs text-emerald-600/70 font-medium">Impacto no terreno, resíduos, carbono.</span>
                                </div>
                                <StarRating value={envScore} setter={setEnvScore} field="esg_environmental_score" icon={Leaf} colorClass="text-emerald-500" />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                                <div>
                                    <span className="font-bold text-blue-900 block flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-600" />
                                        S - Social (Social)
                                    </span>
                                    <span className="text-xs text-blue-600/70 font-medium">Comunidade entorno, acessibilidade urbana.</span>
                                </div>
                                <StarRating value={socScore} setter={setSocScore} field="esg_social_score" icon={Users} colorClass="text-blue-500" />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                <div>
                                    <span className="font-bold text-indigo-900 block flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-indigo-600" />
                                        G - Governance (Governança)
                                    </span>
                                    <span className="text-xs text-indigo-600/70 font-medium">Transparência da SPE, compliance legal.</span>
                                </div>
                                <StarRating value={govScore} setter={setGovScore} field="esg_governance_score" icon={Shield} colorClass="text-indigo-500" />
                            </div>
                        </div>

                        <div className="mt-8">
                            <h4 className="text-sm font-bold text-slate-700 mb-3 block">Certificações Pleiteadas</h4>
                            <div className="flex flex-wrap gap-2">
                                {AVAILABLE_CERTIFICATIONS.map(cert => (
                                    <button
                                        key={cert}
                                        onClick={() => toggleCert(cert)}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${certs.includes(cert)
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                            }`}
                                    >
                                        {certs.includes(cert) && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                                        {cert}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative">
                        <h3 className="text-sm font-bold text-slate-800 mb-3">Memorando Executivo ESG</h3>
                        <textarea
                            value={esgNotes}
                            onChange={(e) => setEsgNotes(e.target.value)}
                            onBlur={() => handleUpdate('esg_notes', esgNotes)}
                            placeholder="Descreva as mitigações ambientais, doações ao município (praças), ou estrutura do consórcio..."
                            className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 outline-none text-slate-700 font-medium resize-none transition-all text-sm"
                        />
                        {isSaving && (
                            <div className="absolute top-8 right-8">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {/* INITIATIVES CALCULATOR */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-indigo-500" />
                                    Motor de Iniciativas ESG
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-1">
                                    Simule o impacto financeiro direto de melhorias no projeto.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {initiatives.map((ini) => (
                                <div
                                    key={ini.id}
                                    className={`relative overflow-hidden p-4 rounded-2xl border transition-all cursor-pointer group ${ini.active ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'}`}
                                    onClick={() => toggleInitiative(ini.id)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors ${ini.active ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                                {ini.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                                            </div>
                                            <div>
                                                <div className={`font-bold text-sm ${ini.active ? 'text-indigo-900' : 'text-slate-700'}`}>
                                                    {ini.name}
                                                </div>
                                                <div className="flex items-center gap-4 mt-1.5">
                                                    <span className="flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                                                        <DollarSign className="w-3 h-3" />
                                                        +{(ini.cost / 1000).toFixed(0)}k (CAPEX)
                                                    </span>
                                                    {ini.vgv_premium > 0 && (
                                                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                                            <TrendingUp className="w-3 h-3" />
                                                            +{ini.vgv_premium}% (VGV)
                                                        </span>
                                                    )}
                                                    {ini.funding_discount > 0 && (
                                                        <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                                            <Percent className="w-3 h-3" />
                                                            -{ini.funding_discount}% a.a. (Funding)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Small label for ESG category */}
                                    <div className="absolute top-4 right-4">
                                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${ini.category === 'E' ? 'text-emerald-700 bg-emerald-100' :
                                            ini.category === 'S' ? 'text-blue-700 bg-blue-100' :
                                                'text-indigo-700 bg-indigo-100'
                                            }`}>
                                            {ini.category}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COMMITTEE DECISION */}
                    <div className="bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-800 relative overflow-hidden">

                        {/* Decorative background flair */}
                        <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <h3 className="text-xl font-black text-white mb-2 flex items-center gap-2">
                            <Gavel className="w-6 h-6 text-indigo-400" />
                            Ata do Comitê de Investimento
                        </h3>
                        <p className="text-slate-400 text-sm font-medium mb-8">
                            Apenas o Sponsor/Diretor deve preencher esta seção para fechar a tese de investimento.
                        </p>

                        <div className="space-y-6 relative z-10">
                            <div>
                                <label className="block text-xs font-black tracking-widest uppercase text-slate-500 mb-3">Veredito Final</label>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                    {[
                                        { id: 'draft', label: 'Rascunho', color: 'bg-slate-800 text-slate-300' },
                                        { id: 'in_review', label: 'Em Análise', color: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
                                        { id: 'approved', label: 'Aprovado (GO)', color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
                                        { id: 'rejected', label: 'Rejeitado / NOGO', color: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' },
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                setDecision(opt.id);
                                                handleUpdate('committee_decision', opt.id);
                                            }}
                                            className={`py-3 px-2 rounded-xl text-xs font-bold text-center transition-all ${decision === opt.id
                                                ? `${opt.color} shadow-inner ring-2 ring-white/10`
                                                : 'bg-slate-800/50 text-slate-500 hover:bg-slate-800'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black tracking-widest uppercase text-slate-500 mb-3">Justificativa / Condicionantes</label>
                                <textarea
                                    value={committeeNotes}
                                    onChange={(e) => setCommitteeNotes(e.target.value)}
                                    onBlur={() => handleUpdate('committee_notes', committeeNotes)}
                                    placeholder="Ex: Aprovado sob a condição de renegociar a permuta para max 12% ou buscar Funding de SFH taxa 9% a.a."
                                    className="w-full h-48 p-4 bg-slate-950/50 border border-slate-700/50 rounded-2xl focus:bg-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none text-slate-300 font-medium resize-none transition-all text-sm placeholder:text-slate-600"
                                />
                            </div>
                        </div>

                    </div>
                </div>

            </div>

        </div>
    );
};

export default ImovibEsgReportForm;
