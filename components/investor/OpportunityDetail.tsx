import React from 'react';
import {
    X, MapPin, TrendingUp, Ruler, Building2, CheckCircle2, ChevronRight, Handshake, Users, Clock
} from 'lucide-react';
import {
    InvestorOpportunity, InterestRole, OpportunityInterest,
    OPPORTUNITY_STATUS_LABELS,
    OPPORTUNITY_TYPE_LABELS, INTEREST_ROLE_LABELS, INTEREST_STAGE_LABELS,
    investorPortalService,
} from '../../services/investorPortalService';
import { Investor } from '../../services/investorService';
import { investorPortalTokenService } from '../../services/investorPortalTokenService';
import LinkedProjectPanel from './LinkedProjectPanel';
import DataRoomPanel from './DataRoomPanel';
import { naVitrine } from '../../utils/oportunidadeNumerosDaVersao';
import { fmtBRL, fmtPct } from '../../utils/format';
import { imovibService } from '../../services/imovibService';
import { ImovibStudy, ImovibScenario } from '../../types';
import type { VersaoPublicada } from '../../utils/imovibVersoes';
import ImovibPainelDoInvestidor from './portal/ImovibPainelDoInvestidor';
import ListasDaVersao from './portal/ListasDaVersao';
import { InvestmentSimulator } from './InvestmentSimulator';
import Button from '../ui/Button';

interface Props {
    opportunity: InvestorOpportunity;
    organizationId: string;
    isAdmin?: boolean;
    uploadedBy?: string;
    investorProfile?: Investor | null;
    portalToken?: string;
    onClose: () => void;
}


const ROLES: InterestRole[] = ['investidor', 'arquiteto', 'engenheiro', 'projetista', 'consultor', 'outro'];

// Due diligence, riscos, modelos de aquisição e comitê saíram para o estudo do Imovib
// (plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 1).
type PitchTab = 'pitch' | 'cenarios' | 'obra' | 'documentos' | 'interesses';
type FormStep = 'view' | 'form' | 'success';

const OpportunityDetail: React.FC<Props> = ({ opportunity, organizationId, isAdmin = false, uploadedBy, investorProfile, portalToken, onClose }) => {
    // Todos os números são os da versão do Imovib; local e obra, do empreendimento (plano
    // docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, Fase 2 — utils/oportunidadeNumerosDaVersao.ts).
    const op = React.useMemo(() => naVitrine(opportunity), [opportunity]);
    const [formStep, setFormStep] = React.useState<FormStep>('view');
    const [pitchTab, setPitchTab] = React.useState<PitchTab>('pitch');
    const [saving, setSaving] = React.useState(false);
    const [interests, setInterests] = React.useState<OpportunityInterest[]>([]);
    const [loadingInterests, setLoadingInterests] = React.useState(false);
    const [interest, setInterest] = React.useState({
        contact_name: investorProfile?.name ?? '',
        contact_email: investorProfile?.email ?? '',
        contact_phone: investorProfile?.phone ?? '',
        role: 'investidor' as InterestRole,
        message: '',
    });

    const [study, setStudy] = React.useState<ImovibStudy | null>(null);
    const [loadingStudy, setLoadingStudy] = React.useState(false);
    // Plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 2: o investidor
    // vê a VERSÃO publicada; o gestor abre a mesma versão (prévia). Rascunho sem versão: o gestor
    // vê o estudo atual, avisado de que ainda não é o que o investidor verá.
    const [versaoPublicada, setVersaoPublicada] = React.useState<VersaoPublicada | null>(null);
    const [erroDoEstudo, setErroDoEstudo] = React.useState<string | null>(null);
    // Prévia sem versão: os cenários do estudo atual (a versão traz os dela).
    const [cenariosAoVivo, setCenariosAoVivo] = React.useState<ImovibScenario[]>([]);

    React.useEffect(() => {
        if (!op.imovib_study_id) { setStudy(null); setVersaoPublicada(null); return; }
        let vivo = true;
        setLoadingStudy(true);
        setErroDoEstudo(null);
        const versao = portalToken
            ? investorPortalTokenService.getVersaoPublicadaByToken(portalToken, op.id!)
            : op.imovib_version_id ? imovibService.versaoPublicada(op.imovib_version_id) : null;
        const carga: Promise<void> = versao
            ? versao.then(vp => { if (vivo) { setVersaoPublicada(vp); setStudy(vp.study); } })
            : Promise.all([imovibService.getStudyById(op.imovib_study_id, true), imovibService.listarCenarios(op.imovib_study_id)])
                .then(([s, c]) => { if (vivo) { setVersaoPublicada(null); setStudy(s); setCenariosAoVivo(c); } });
        carga
            .catch(err => { if (vivo) { setStudy(null); setVersaoPublicada(null); setErroDoEstudo((err as Error).message); } })
            .finally(() => { if (vivo) setLoadingStudy(false); });
        return () => { vivo = false; };
    }, [op.imovib_study_id, op.imovib_version_id, portalToken]);

    // Ficha técnica: a seção Produto CONGELADA na versão (nada se recalcula aqui).
    const produto = versaoPublicada?.calculo?.secoes?.find(x => x.id === 'produto') ?? null;

    const loadInterests = React.useCallback(() => {
        if (!op.id) return;
        setLoadingInterests(true);
        investorPortalService.listInterests(organizationId, op.id)
            .then(setInterests)
            .catch(err => console.error('Erro ao carregar interesses', err))
            .finally(() => setLoadingInterests(false));
    }, [organizationId, op.id]);

    React.useEffect(() => {
        if (pitchTab === 'interesses' && isAdmin) loadInterests();
    }, [pitchTab, isAdmin, loadInterests]);

    const handleInterestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!interest.contact_name.trim()) return;
        setSaving(true);
        try {
            if (portalToken) {
                await investorPortalTokenService.submitInterestByToken(portalToken, {
                    opportunityId: op.id!,
                    name: interest.contact_name,
                    email: interest.contact_email,
                    phone: interest.contact_phone,
                    role: interest.role,
                    message: interest.message,
                });
            } else {
                await investorPortalService.addInterest({
                    organization_id: organizationId,
                    opportunity_id: op.id!,
                    ...interest,
                });
            }
            setFormStep('success');
        } catch (err) {
            console.error('Erro ao registrar interesse', err);
            alert('Erro ao registrar interesse. Tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const hasFinancials = op.comVersao;

    // ── Analytics de interesses ──────────────────────────────────
    const interestsByRole = ROLES.reduce<Record<string, number>>((acc, r) => {
        acc[r] = interests.filter(i => i.role === r).length;
        return acc;
    }, {});
    const interestsByStage = (['lead','interesse','reuniao','proposta','negociacao','fechado'] as const)
        .reduce<Record<string, number>>((acc, s) => {
            acc[s] = interests.filter(i => (i.stage ?? 'lead') === s).length;
            return acc;
        }, {});

    const hasLinkedProject = !!op.obra_id;

    const locationLabel = [op.cidade, op.uf].filter(Boolean).join(', ');
    const opportunityPresentation = [
        `${op.title} está em fase de ${op.status ? OPPORTUNITY_STATUS_LABELS[op.status].toLowerCase() : 'avaliação'}${op.opportunity_type ? ` no formato ${OPPORTUNITY_TYPE_LABELS[op.opportunity_type].toLowerCase()}` : ''}.`,
        locationLabel ? `Localização: ${locationLabel}.` : null,
        op.vgv != null ? `VGV estimado de ${fmtBRL(op.vgv)}.` : null,
        op.custo_total != null ? `Custo estimado (obra e terreno) de ${fmtBRL(op.custo_total)}.` : null,
        op.ticket_min != null ? `Ticket mínimo de ${fmtBRL(op.ticket_min)}.` : null,
        op.prazo_meses ? `Prazo previsto de ${op.prazo_meses} meses.` : null,
        op.roi_pct != null || op.tir_pct != null
            ? `Indicadores projetados: ${op.roi_pct != null ? `ROI de ${fmtPct(op.roi_pct)}` : ''}${op.roi_pct != null && op.tir_pct != null ? ' e ' : ''}${op.tir_pct != null ? `TIR de ${fmtPct(op.tir_pct)}` : ''}.`
            : null,
    ].filter(Boolean).join(' ');
    const ADMIN_TABS: { id: PitchTab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        { id: 'cenarios', label: 'Viabilidade & Investimento' },
        ...(hasLinkedProject ? [{ id: 'obra' as PitchTab, label: 'Obra' }] : []),
        { id: 'documentos', label: 'Data Room' },
        { id: 'interesses', label: interests.length > 0 ? `Interesses (${interests.length})` : 'Interesses' },
    ];
    const PUBLIC_TABS: { id: PitchTab; label: string }[] = [
        { id: 'pitch', label: 'Detalhes' },
        { id: 'cenarios', label: 'Viabilidade & Investimento' },
        ...(hasLinkedProject ? [{ id: 'obra' as PitchTab, label: 'Obra ao Vivo' }] : []),
        { id: 'documentos', label: 'Data Room' },
    ];
    const tabs = isAdmin ? ADMIN_TABS : PUBLIC_TABS;

    return (
        <div className="fixed inset-0 z-[60] bg-gray-50 overflow-y-auto">

            {/* ── Header escuro: navbar + hero + título e captação ── */}
            <div className="bg-[#0B1727] text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

                {/* navbar */}
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3 relative z-10">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="gap-2 text-sm font-bold text-white/60 hover:text-white hover:bg-transparent transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Voltar
                    </Button>
                    <span className="text-sm text-white/40 truncate flex-1 hidden sm:block">{op.title}</span>
                </div>

                {/* hero image (se existir) */}
                {op.capa && (
                    <div className="relative h-56 sm:h-72 overflow-hidden">
                        <img src={op.capa} alt={op.title} className="w-full h-full object-cover opacity-40" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1727] via-[#0B1727]/60 to-transparent" />
                    </div>
                )}

                {/* título + metadata e Destaque de Captação ao lado */}
                <div className="max-w-5xl mx-auto px-6 pb-10 pt-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                        {/* Info Empreendimento */}
                        <div className="md:col-span-2 space-y-4">
                            <div className="flex flex-wrap items-start gap-3">
                                {op.status && (
                                    <span className="text-sm font-medium text-white/80">
                                        {OPPORTUNITY_STATUS_LABELS[op.status]}
                                    </span>
                                )}
                                {op.opportunity_type && (
                                    <span className="text-sm text-white/60">
                                        {OPPORTUNITY_TYPE_LABELS[op.opportunity_type]}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl sm:text-5xl font-black leading-tight tracking-tight">{op.title}</h1>
                            {op.subtitle && <p className="text-white/70 text-lg font-medium leading-relaxed">{op.subtitle}</p>}
                            <div className="flex flex-wrap gap-5 text-sm text-white/50 pt-2">
                                {locationLabel && (
                                    <span className="flex items-center gap-1.5 font-semibold">
                                        <MapPin className="w-4 h-4 text-blue-500" />
                                        {locationLabel}
                                    </span>
                                )}
                                {op.prazo_meses && (
                                    <span className="flex items-center gap-1.5 font-semibold">
                                        <Clock className="w-4 h-4 text-emerald-500" />
                                        {op.prazo_meses} meses
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Destaque: ticket, prazo e TIR da versão (a meta de captação real vem na Fase 4). */}
                        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10 space-y-3">
                            <div>
                                <span className="text-xs text-white/60 block">Ticket mínimo</span>
                                <span className="text-2xl font-semibold">{op.ticket_min != null ? fmtBRL(op.ticket_min) : 'Consultar'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                                <div>
                                    <span className="text-white/50 block">Prazo</span>
                                    <span className="font-semibold text-white">{op.prazo_meses ? `${op.prazo_meses} meses` : '—'}</span>
                                </div>
                                <div>
                                    <span className="text-white/50 block">TIR projetada</span>
                                    <span className="font-semibold text-emerald-400">{op.tir_pct != null ? fmtPct(op.tir_pct) : '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Corpo (fundo cinza) ── */}
            <div className="max-w-5xl mx-auto px-6 py-8 pb-28 sm:pb-8">
                {formStep === 'view' && (
                    <div className="hidden sm:flex sticky top-4 z-30 mb-6 items-center justify-between gap-4 bg-white/95 backdrop-blur border border-gray-100 shadow-lg rounded-2xl p-4">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Oportunidade</p>
                            <p className="font-black text-gray-900 truncate">{op.title}</p>
                        </div>
                        <div className="flex items-center gap-6 text-sm flex-shrink-0">
                            <div>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Ticket mín.</p>
                                <p className="font-black text-gray-900">{op.ticket_min != null ? fmtBRL(op.ticket_min) : '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">TIR</p>
                                <p className="font-black text-emerald-600">{op.tir_pct != null ? fmtPct(op.tir_pct) : '—'}</p>
                            </div>
                            <Button
                                variant="primary"
                                size="md"
                                onClick={() => setFormStep('form')}
                                className="gap-2 px-5 py-3 text-button font-black uppercase tracking-widest rounded-xl transition-colors"
                            >
                                <Handshake className="w-4 h-4" />
                                Manifestar Interesse
                            </Button>
                        </div>
                    </div>
                )}

                {formStep === 'view' && (
                    <>
                        {/* KPIs — 3 colunas compactas */}
                        {hasFinancials && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                                {op.vgv != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 col-span-2 sm:col-span-1">
                                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider mb-1">VGV</p>
                                        <p className="text-lg font-black text-blue-900 leading-none">{fmtBRL(op.vgv)}</p>
                                    </div>
                                )}
                                {op.roi_pct != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3"/>ROI</p>
                                        <p className="text-lg font-black text-emerald-700 leading-none">{fmtPct(op.roi_pct)}</p>
                                    </div>
                                )}
                                {op.tir_pct != null && (
                                    <div className="sm:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-indigo-600 uppercase tracking-wider mb-1">TIR</p>
                                        <p className="text-lg font-black text-indigo-700 leading-none">{fmtPct(op.tir_pct)}</p>
                                    </div>
                                )}
                                {op.custo_total != null && (
                                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1">Custo</p>
                                        <p className="text-lg font-black text-amber-800 leading-none">{fmtBRL(op.custo_total)}</p>
                                    </div>
                                )}
                                {op.ticket_min != null && (
                                    <div className="sm:hidden bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mb-1">Ticket mín.</p>
                                        <p className="text-lg font-black text-gray-700 leading-none">{fmtBRL(op.ticket_min)}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Card principal com tabs */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                            {/* Tabs */}
                            {tabs.length > 1 && (
                                <div className="flex gap-0 border-b border-gray-100 px-2">
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setPitchTab(tab.id)}
                                            className={`px-5 py-4 text-sm font-bold transition-all border-b-2 -mb-px ${pitchTab === tab.id
                                                ? 'text-blue-600 border-blue-600'
                                                : 'text-gray-400 border-transparent hover:text-gray-600'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="p-6 sm:p-8">
                                {/* ── ABA: Detalhes ── */}
                                {pitchTab === 'pitch' && (
                                    <div className="space-y-8">
                                        {isAdmin && !portalToken && (
                                            <p className="rounded-[10px] bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                                Due diligence, riscos, modelos de aquisição e comitê ficam no estudo de viabilidade
                                                {study ? <> (<span className="font-medium text-slate-800">{study.name}</span>: abas Premissas › Terreno, Sensibilidade e Risco e Comitê)</> : ': vincule um estudo em Editar'}.
                                            </p>
                                        )}
                                        {/* Resumo Executivo / Descrição */}
                                        <div className="bg-gray-50/50 rounded-3xl p-6 border border-gray-100 space-y-3">
                                            <h4 className="text-sm font-black text-gray-900">Apresentação do Empreendimento</h4>
                                            <p className="text-sm text-gray-600 leading-relaxed font-medium">{opportunityPresentation}</p>
                                        </div>

                                        {/* Ficha técnica: a seção Produto congelada na versão + prazo (Fase 2 do plano 2026-11-21). */}
                                        {(produto?.tabelas?.[0] || op.prazo_meses) && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <Ruler className="w-4 h-4 text-blue-600" />
                                                <span className="text-sm font-semibold text-gray-700">Ficha técnica</span>
                                            </div>
                                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                {(produto?.tabelas?.[0]?.linhas ?? []).map(([rotulo, valor]) => (
                                                    <div key={rotulo} className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                        <dt className="text-xs text-gray-500 mb-1">{rotulo}</dt>
                                                        <dd className="text-base font-semibold text-gray-800">{valor}</dd>
                                                    </div>
                                                ))}
                                                {op.prazo_meses && (
                                                    <div className="bg-gray-50/50 border border-gray-100 rounded-2xl p-4">
                                                        <dt className="text-xs text-gray-500 mb-1">Prazo do projeto</dt>
                                                        <dd className="text-base font-semibold text-gray-800">{op.prazo_meses} meses</dd>
                                                    </div>
                                                )}
                                            </dl>
                                        </div>
                                        )}

                                        {/* Fotos: imagens do empreendimento (Fase 3 do plano 2026-11-21; a galeria própria saiu). */}
                                        {(op.fotos?.length ?? 0) > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Building2 className="w-4 h-4 text-blue-600" />
                                                    <span className="text-sm font-semibold text-gray-700">Imagens do empreendimento</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {op.fotos!.map((f, idx) => (
                                                        <figure key={`${f.url}-${idx}`} className="relative h-48 rounded-2xl overflow-hidden border border-gray-100">
                                                            <img src={f.url} alt={f.legenda ?? `Imagem ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                                            {f.legenda && (
                                                                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-sm text-white">{f.legenda}</figcaption>
                                                            )}
                                                        </figure>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Localização Inteligente e Distâncias */}
                                        {op.distances_json && op.distances_json.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <MapPin className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Conveniências e Distâncias</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {op.distances_json.map((item: any, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-3.5 bg-gray-50/50 border border-gray-100 rounded-2xl">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                                                                    <MapPin className="w-4 h-4 text-blue-600" />
                                                                </div>
                                                                <span className="text-sm font-bold text-gray-800">{item.place}</span>
                                                            </div>
                                                            <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-xl font-mono">{item.distance}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Equipe / Parceiros */}
                                        {op.team_json && op.team_json.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Users className="w-4 h-4 text-blue-600" />
                                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Equipe de Desenvolvimento & RI</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {op.team_json.map((member: any, idx) => (
                                                        <div key={idx} className="flex items-center justify-between p-4 bg-gray-50/50 border border-gray-100 rounded-3xl">
                                                            <div>
                                                                <p className="text-sm font-black text-gray-800">{member.name}</p>
                                                                <p className="text-xs font-bold text-gray-400 mt-0.5 uppercase tracking-wide">{member.role}</p>
                                                            </div>
                                                            {member.experience && (
                                                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg uppercase">
                                                                    {member.experience}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* CTA Manifestar Interesse */}
                                        <div className="pt-4">
                                            <Button
                                                variant="primary"
                                                size="lg"
                                                onClick={() => setFormStep('form')}
                                                className="w-full sm:w-auto justify-center gap-2 px-8 py-4 font-black rounded-2xl transition-all shadow-xl text-sm uppercase tracking-wider"
                                            >
                                                <Handshake className="w-4 h-4" />
                                                Manifestar Interesse
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* ── ABA: Cenários ── */}
                                {pitchTab === 'cenarios' && (
                                    <div className="space-y-8">
                                        {/* Plano 2026-11-15, Fase 4: com estudo do Imovib, o painel de viabilidade
                                            (versão publicada; prévia do estudo atual para o gestor sem versão). */}
                                        {study ? (
                                            <ImovibPainelDoInvestidor
                                                versaoPublicada={versaoPublicada}
                                                study={study}
                                                cenarios={versaoPublicada?.cenarios ?? cenariosAoVivo}
                                                accent={portalToken ? 'portal' : 'indigo'}
                                                aviso={!versaoPublicada && !portalToken ? (
                                                    <p className="rounded-[10px] bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                                                        Prévia do estudo atual. O investidor só vê uma versão congelada: escolha-a em Editar antes de publicar.
                                                    </p>
                                                ) : undefined}
                                            />
                                        ) : (
                                            <p className="rounded-[10px] bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-600">
                                                {erroDoEstudo
                                                    ? `Não foi possível ler o estudo: ${erroDoEstudo}`
                                                    : loadingStudy ? 'Lendo o estudo de viabilidade…'
                                                        : 'Esta oportunidade ainda não tem estudo de viabilidade vinculado: os números aparecem quando a versão do estudo for publicada.'}
                                            </p>
                                        )}

                                        {versaoPublicada && <ListasDaVersao versaoPublicada={versaoPublicada} />}

                                        {/* Simulador: só com a versão (números congelados), item 2.4 do plano 2026-11-21. */}
                                        <InvestmentSimulator numeros={op} ticketMinimo={op.ticket_min} versao={versaoPublicada?.versao.label ?? null} />

                                        {/* CTA Manifestar Interesse */}
                                        <div className="pt-4">
                                            <Button
                                                variant="primary"
                                                size="lg"
                                                onClick={() => setFormStep('form')}
                                                className="w-full sm:w-auto justify-center gap-2 px-8 py-4 font-black rounded-2xl transition-all shadow-xl text-sm uppercase tracking-wider"
                                            >
                                                <Handshake className="w-4 h-4" />
                                                Manifestar Interesse
                                                <ChevronRight className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* ── ABA: Obra ao Vivo ── */}
                                {pitchTab === 'obra' && hasLinkedProject && (
                                    <div className="space-y-6">
                                        <LinkedProjectPanel
                                            projectId={op.obra_id!}
                                            organizationId={organizationId}
                                            costEstimate={op.custo_total}
                                        />
                                        <Button
                                            variant="primary"
                                            size="lg"
                                            onClick={() => setFormStep('form')}
                                            className="gap-2 px-8 py-4 bg-[#0B1727] hover:bg-blue-900 font-bold rounded-2xl transition-all shadow-xl text-sm"
                                        >
                                            <Handshake className="w-4 h-4" />
                                            Manifestar Interesse
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}

                                {/* ── ABA: Documentos ── */}
                                {pitchTab === 'documentos' && (
                                    <DataRoomPanel
                                        empreendimentoId={op.local?.empreendimento_id ?? null}
                                        opportunityId={op.id!}
                                        organizationId={organizationId}
                                        isAdmin={isAdmin}
                                        uploadedBy={uploadedBy}
                                        portalToken={portalToken}
                                    />
                                )}

                                {/* ── ABA: Interesses (admin) ── */}
                                {pitchTab === 'interesses' && isAdmin && (
                                    <div className="space-y-6">
                                        {loadingInterests ? (
                                            <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
                                        ) : interests.length === 0 ? (
                                            <div className="text-center py-12 bg-gray-50 rounded-2xl">
                                                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                                <p className="text-sm font-bold text-gray-400">Nenhum interesse recebido ainda</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Funil de conversão</p>
                                                    <div className="space-y-2">
                                                        {(['lead','interesse','reuniao','proposta','negociacao','fechado'] as const).map(s => {
                                                            const count = interestsByStage[s] ?? 0;
                                                            const pct = interests.length > 0 ? (count / interests.length) * 100 : 0;
                                                            return (
                                                                <div key={s} className="flex items-center gap-3">
                                                                    <span className="text-xs text-gray-500 w-24 font-medium">{INTEREST_STAGE_LABELS[s]}</span>
                                                                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                                                    </div>
                                                                    <span className="text-xs font-bold text-gray-700 w-6 text-right">{count}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Perfil dos interessados</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {ROLES.filter(r => (interestsByRole[r] ?? 0) > 0).map(r => (
                                                            <div key={r} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl">
                                                                <span className="text-xs font-bold text-gray-700">{INTEREST_ROLE_LABELS[r]}</span>
                                                                <span className="text-xs font-black text-blue-600">{interestsByRole[r]}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Mais recentes</p>
                                                    <div className="space-y-2">
                                                        {interests.slice(0, 6).map(i => (
                                                            <div key={i.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                                                <div>
                                                                    <span className="text-sm font-bold text-gray-800">{i.contact_name}</span>
                                                                    <span className="ml-2 text-xs text-gray-400">{INTEREST_ROLE_LABELS[i.role]}</span>
                                                                </div>
                                                                <span className="text-xs font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded-lg">
                                                                    {INTEREST_STAGE_LABELS[i.stage ?? 'lead']}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                            </div>
                        </div>
                    </>
                )}

                {/* ── Formulário de interesse ── */}
                {formStep === 'form' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-lg">
                        <Button variant="ghost" size="sm" onClick={() => setFormStep('view')} className="text-button font-bold text-blue-600 hover:text-blue-700 hover:bg-transparent gap-1 mb-5">
                            ← Voltar
                        </Button>
                        <h3 className="text-2xl font-black text-gray-900 mb-1">Manifestar Interesse</h3>
                        <p className="text-sm text-gray-500 mb-6">{op.title}</p>
                        <form onSubmit={handleInterestSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nome completo *</label>
                                <input
                                    type="text" required
                                    value={interest.contact_name}
                                    onChange={e => setInterest(p => ({ ...p, contact_name: e.target.value }))}
                                    placeholder="Seu nome"
                                    className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">E-mail</label>
                                    <input
                                        type="email"
                                        value={interest.contact_email}
                                        onChange={e => setInterest(p => ({ ...p, contact_email: e.target.value }))}
                                        placeholder="seu@email.com"
                                        className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Telefone / WhatsApp</label>
                                    <input
                                        type="tel"
                                        value={interest.contact_phone}
                                        onChange={e => setInterest(p => ({ ...p, contact_phone: e.target.value }))}
                                        placeholder="(00) 00000-0000"
                                        className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Perfil</label>
                                <div className="flex flex-wrap gap-2">
                                    {ROLES.map(r => (
                                        <button key={r} type="button"
                                            onClick={() => setInterest(p => ({ ...p, role: r }))}
                                            className={`px-3 py-1.5 rounded-xl text-button font-bold transition-all ${interest.role === r ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            {INTEREST_ROLE_LABELS[r]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 text-button mb-1.5">Mensagem (opcional)</label>
                                <textarea rows={3}
                                    value={interest.message}
                                    onChange={e => setInterest(p => ({ ...p, message: e.target.value }))}
                                    placeholder="Conte um pouco sobre seu interesse ou proposta..."
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                            <Button type="submit" variant="primary" size="lg" disabled={saving}
                                className="w-full px-6 py-4 font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                            >
                                {saving ? 'Enviando...' : 'Enviar manifestação'}
                            </Button>
                        </form>
                    </div>
                )}

                {/* ── Sucesso ── */}
                {formStep === 'success' && (
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 max-w-md mx-auto text-center">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-3">Interesse registrado!</h3>
                        <p className="text-gray-500 mb-8 text-sm">
                            Sua manifestação de interesse em <strong>{op.title}</strong> foi recebida. Nossa equipe entrará em contato em breve.
                        </p>
                        <Button variant="primary" size="lg" onClick={onClose} className="px-8 py-3 bg-gray-900 hover:bg-gray-700 font-bold rounded-2xl transition-colors">
                            Voltar às oportunidades
                        </Button>
                    </div>
                )}
            </div>
            {formStep === 'view' && (
                <div className="sm:hidden fixed inset-x-0 bottom-0 z-[80] bg-white border-t border-gray-200 shadow-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Ticket mín.</p>
                            <p className="font-black text-gray-900 truncate">{op.ticket_min != null ? fmtBRL(op.ticket_min) : 'Consultar'}</p>
                        </div>
                        <button
                            onClick={() => setFormStep('form')}
                            className="flex-shrink-0 flex items-center gap-2 px-5 py-3 bg-blue-600 text-white text-button font-black uppercase tracking-widest rounded-xl shadow-lg"
                        >
                            <Handshake className="w-4 h-4" />
                            Interesse
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OpportunityDetail;
