import React, { useState } from 'react';
import { ImovibStudy } from '../types';
import { useImovibMath } from '../hooks/useImovibMath';
import { imovibService } from '../services/imovibService';
import { useToast } from '../hooks/useToast';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { IMOVIB_DEFAULTS } from '../constants/imovibDefaults';
import { KpiCard, kpiColorFromClass } from './ui/KpiCard';
import { Leaf, Users, Shield, Award, CheckCircle2, ChevronDown, Gavel, DollarSign, TrendingUp, Percent } from 'lucide-react';

interface ImovibEsgReportFormProps {
    study: ImovibStudy;
    onDataChanged: () => void;
}

// Nome do campo como o usuário o vê, para a mensagem de erro ao salvar.
const ROTULO_CAMPO: Partial<Record<keyof ImovibStudy, string>> = {
    esg_certifications: 'as certificações',
    esg_environmental_score: 'a nota ambiental (E)',
    esg_social_score: 'a nota social (S)',
    esg_governance_score: 'a nota de governança (G)',
    esg_notes: 'as notas ESG',
    committee_decision: 'a decisão do comitê',
    committee_notes: 'as notas do comitê',
};

const AVAILABLE_CERTIFICATIONS = [
    'LEED (Ouro/Platina)',
    'AQUA-HQE',
    'EDGE',
    'Selo Casa Azul CAIXA',
    'GRESB',
    'Fitwel',
    'Procelifica'
];

export interface RatingOpura {
    rating: string;
    cor: string;
    fundo: string;
}

/**
 * Rating Opura: prêmio da TIR sobre a barreira (TMA do estudo) + média ESG.
 * Até 2026-10-12 a barreira era 12% a.a. FIXO, qualquer que fosse a TMA da aba
 * Dinâmica (item 5.5 do plano). Testado em __tests__/imovibRatingOpura.test.ts.
 *
 * @param tirAnual TIR do projeto em % a.a. (NaN = sem TIR)
 * @param tma      TMA do estudo em % a.a. (a barreira)
 * @param mediaEsg média das notas E, S e G (1 a 5)
 */
export function calcularRatingOpura(tirAnual: number, tma: number, mediaEsg: number): RatingOpura {
    const tir = Number.isNaN(tirAnual) ? 0 : tirAnual;
    if (tir > 0) {
        if (tir > tma + 8) return { rating: mediaEsg >= 4 ? 'AAA' : 'AA', cor: 'text-emerald-700', fundo: 'bg-emerald-100 border-emerald-200' };
        if (tir > tma + 4) return { rating: mediaEsg >= 3.5 ? 'AA' : 'A', cor: 'text-emerald-600', fundo: 'bg-emerald-50 border-emerald-200' };
        if (tir >= tma) return { rating: mediaEsg >= 3 ? 'BBB' : 'BB', cor: 'text-blue-600', fundo: 'bg-blue-50 border-blue-200' };
        return { rating: 'C', cor: 'text-rose-600', fundo: 'bg-rose-50 border-rose-200' };
    }
    return { rating: 'N/A', cor: 'text-slate-400', fundo: 'bg-slate-50' };
}

const fmtPct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Nota de 1 a 5 (E, S e G). Componente de MÓDULO: declarado dentro do render, o
 * React o tratava como componente novo a cada renderização e remontava os
 * botões (mesmo defeito do InputRow de Receitas e Capital, item 5.3).
 */
const NotaEsg: React.FC<{
    rotulo: string;
    valor: number;
    onChange: (nota: number) => void;
    icone: React.ElementType;
    corAtiva: string;
}> = ({ rotulo, valor, onChange, icone: Icone, corAtiva }) => (
    <div className="flex items-center gap-1" role="group" aria-label={rotulo}>
        {[1, 2, 3, 4, 5].map(nota => (
            <button
                key={nota}
                type="button"
                onClick={() => onChange(nota)}
                aria-label={`${rotulo}: nota ${nota} de 5`}
                aria-pressed={nota <= valor}
                className={`p-1.5 rounded-[6px] transition-colors ${nota <= valor ? corAtiva : 'text-slate-200 hover:text-slate-300'}`}
            >
                <Icone className="w-6 h-6 fill-current" />
            </button>
        ))}
    </div>
);

const ImovibEsgReportForm: React.FC<ImovibEsgReportFormProps> = ({ study, onDataChanged }) => {
    const math = useImovibMath(study);
    const { showToast } = useToast();
    const { pode, motivo } = useImovibEdicao();

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

    // Barreira do rating = TMA do estudo (aba Dinâmica); vazio usa o MESMO padrão do motor.
    const tma = study.discount_rate ?? IMOVIB_DEFAULTS.discount_rate;
    // Penalidade qualitativa: média ESG baixa rebaixa o rating.
    const avgEsg = (envScore + socScore + govScore) / 3;
    const { rating, cor: ratingColor } = calcularRatingOpura(math.annualIrr, tma, avgEsg);

    const handleUpdate = async (field: keyof ImovibStudy, value: any) => {
        try {
            setIsSaving(true);
            await imovibService.updateStudy(study.id, { [field]: value });
            onDataChanged();
        } catch (e) {
            console.error(e);
            showToast(`Erro ao salvar ${ROTULO_CAMPO[field] ?? String(field)}: ${(e as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleCert = (cert: string) => {
        const newCerts = certs.includes(cert) ? certs.filter(c => c !== cert) : [...certs, cert];
        setCerts(newCerts);
        handleUpdate('esg_certifications', newCerts);
    };

    const toggleInitiative = async (id: string) => {
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

        // Antes: updateStudy sem await e sem catch — isSaving voltava a false na
        // hora e a falha não aparecia para o usuário.
        try {
            setIsSaving(true);
            await imovibService.updateStudy(study.id, {
                esg_initiatives: newInis,
                esg_environmental_score: finalE,
                esg_social_score: finalS,
                esg_governance_score: finalG
            });
            onDataChanged();
        } catch (e) {
            console.error(e);
            showToast(`Erro ao salvar a iniciativa ESG: ${(e as Error).message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">

            <div className="flex items-center justify-between gap-6 mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Award className="w-5 h-5 text-emerald-500" />
                        Parecer do Comitê e ESG
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 max-w-2xl">
                        Avaliação qualitativa institucional do projeto. O rating abaixo é gerado dinamicamente mesclando o prêmio de risco (TIR projetada) e as conformidades de impacto socioambiental (ESG).
                    </p>
                </div>

                {/* Rating dinâmico — §4: KpiCard; a cor do rating vem de calcularRatingOpura (texto colorido, sem fundo — §8) */}
                <KpiCard
                    label="Rating Opura"
                    value={rating}
                    sub={`TIR ≥ TMA do estudo (${fmtPct(tma)}% a.a.)`}
                    title="A TMA vem da aba Dinâmica. Faixas: TIR acima de TMA + 8 p.p. = AA/AAA; acima de TMA + 4 p.p. = A/AA; a partir da TMA = BB/BBB; abaixo = C."
                    icon={<Award className="w-4 h-4" />}
                    color={kpiColorFromClass(ratingColor)}
                    className="shrink-0"
                />
            </div>

            {/* Tudo aqui grava: notas E/S/G, certificações, memorando, iniciativas e ata do comitê. */}
            <fieldset disabled={!pode} title={!pode ? motivo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 grid grid-cols-1 lg:grid-cols-2 gap-6">

                <div className="space-y-6">
                    {/* ESG SCORING */}
                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Pilha ESG (Matriz Material)</h3>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-[10px] border border-emerald-100">
                                <div>
                                    <span className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                                        <Leaf className="w-4 h-4 text-emerald-600" />
                                        E - Environmental (Ambiental)
                                    </span>
                                    <span className="text-xs text-emerald-600/70">Impacto no terreno, resíduos, carbono.</span>
                                </div>
                                <NotaEsg rotulo="Ambiental (E)" valor={envScore} onChange={(n) => { setEnvScore(n); handleUpdate('esg_environmental_score', n); }} icone={Leaf} corAtiva="text-emerald-500" />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-blue-50/50 rounded-[10px] border border-blue-100">
                                <div>
                                    <span className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-blue-600" />
                                        S - Social (Social)
                                    </span>
                                    <span className="text-xs text-blue-600/70">Comunidade entorno, acessibilidade urbana.</span>
                                </div>
                                <NotaEsg rotulo="Social (S)" valor={socScore} onChange={(n) => { setSocScore(n); handleUpdate('esg_social_score', n); }} icone={Users} corAtiva="text-blue-500" />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-[10px] border border-indigo-100">
                                <div>
                                    <span className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                                        <Shield className="w-4 h-4 text-indigo-600" />
                                        G - Governance (Governança)
                                    </span>
                                    <span className="text-xs text-indigo-600/70">Transparência da SPE, compliance legal.</span>
                                </div>
                                <NotaEsg rotulo="Governança (G)" valor={govScore} onChange={(n) => { setGovScore(n); handleUpdate('esg_governance_score', n); }} icone={Shield} corAtiva="text-indigo-500" />
                            </div>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">Certificações Pleiteadas</h4>
                            <div className="flex flex-wrap gap-2">
                                {AVAILABLE_CERTIFICATIONS.map(cert => (
                                    <button
                                        key={cert}
                                        onClick={() => toggleCert(cert)}
                                        className={`inline-flex items-center gap-1 h-9 px-3 rounded-[6px] text-[13px] font-medium border transition-all ${certs.includes(cert)
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                            }`}
                                    >
                                        {certs.includes(cert) && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {cert}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm relative">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Memorando Executivo ESG</h3>
                        <textarea
                            value={esgNotes}
                            onChange={(e) => setEsgNotes(e.target.value)}
                            onBlur={() => handleUpdate('esg_notes', esgNotes)}
                            placeholder="Descreva as mitigações ambientais, doações ao município (praças), ou estrutura do consórcio..."
                            className="w-full h-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none text-slate-700 resize-none transition-all text-sm"
                        />
                        {isSaving && (
                            <div className="absolute top-6 right-6">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {/* INITIATIVES CALCULATOR */}
                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-indigo-500" />
                                    Motor de Iniciativas ESG
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Simule o impacto financeiro direto de melhorias no projeto.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {initiatives.map((ini) => (
                                <div
                                    key={ini.id}
                                    // <div> clicável: o fieldset desabilitado não o alcança — a trava é aqui.
                                    className={`relative overflow-hidden p-4 rounded-[10px] border transition-all ${pode ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} group ${ini.active ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'}`}
                                    aria-disabled={!pode || undefined}
                                    onClick={() => { if (pode) toggleInitiative(ini.id); }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors ${ini.active ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                                {ini.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                                            </div>
                                            <div>
                                                <div className={`font-semibold text-sm ${ini.active ? 'text-indigo-900' : 'text-slate-700'}`}>
                                                    {ini.name}
                                                </div>
                                                <div className="flex items-center gap-4 mt-1.5">
                                                    <span className="flex items-center gap-1 text-sm font-normal text-rose-600">
                                                        <DollarSign className="w-3 h-3" />
                                                        +{(ini.cost / 1000).toFixed(0)}k (CAPEX)
                                                    </span>
                                                    {ini.vgv_premium > 0 && (
                                                        <span className="flex items-center gap-1 text-sm font-normal text-emerald-600">
                                                            <TrendingUp className="w-3 h-3" />
                                                            +{ini.vgv_premium}% (VGV)
                                                        </span>
                                                    )}
                                                    {ini.funding_discount > 0 && (
                                                        <span className="flex items-center gap-1 text-sm font-normal text-blue-600">
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
                                        <span className={`text-sm font-normal ${ini.category === 'E' ? 'text-emerald-700' :
                                            ini.category === 'S' ? 'text-blue-700' :
                                                'text-indigo-700'
                                            }`}>
                                            {ini.category}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COMMITTEE DECISION — card branco do §16 (era cartão escuro com brilho decorativo) */}
                    <div className="bg-white rounded-[10px] p-6 border border-slate-100 shadow-sm">

                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Gavel className="w-5 h-5 text-indigo-600" />
                            Ata do Comitê de Investimento
                        </h3>
                        <p className="text-slate-500 text-sm mt-0.5 mb-6">
                            Apenas o Sponsor/Diretor deve preencher esta seção para fechar a tese de investimento.
                        </p>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Veredito Final</label>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                                    {[
                                        // Selecionado = mesmo vocabulário dos chips de certificação (fundo claro + borda + texto da cor).
                                        { id: 'draft', label: 'Rascunho', color: 'bg-slate-100 border-slate-300 text-slate-700' },
                                        { id: 'in_review', label: 'Em Análise', color: 'bg-blue-50 border-blue-200 text-blue-700' },
                                        { id: 'approved', label: 'Aprovado (GO)', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                                        { id: 'rejected', label: 'Rejeitado / NOGO', color: 'bg-rose-50 border-rose-200 text-rose-700' },
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => {
                                                setDecision(opt.id);
                                                handleUpdate('committee_decision', opt.id);
                                            }}
                                            className={`min-h-9 py-1.5 px-2 rounded-[6px] border text-[13px] font-medium text-center transition-all ${decision === opt.id
                                                ? opt.color
                                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Justificativa / Condicionantes</label>
                                <textarea
                                    value={committeeNotes}
                                    onChange={(e) => setCommitteeNotes(e.target.value)}
                                    onBlur={() => handleUpdate('committee_notes', committeeNotes)}
                                    placeholder="Ex: Aprovado sob a condição de renegociar a permuta para max 12% ou buscar Funding de SFH taxa 9% a.a."
                                    className="w-full h-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none text-slate-700 resize-none transition-all text-sm"
                                />
                            </div>
                        </div>

                    </div>
                </div>

            </fieldset>

        </div>
    );
};

export default ImovibEsgReportForm;
