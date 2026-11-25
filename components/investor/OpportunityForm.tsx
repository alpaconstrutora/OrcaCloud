import React from 'react';
import { X, Building2, MapPin, Eye, EyeOff, Unlink, Plus, Trash2, Users } from 'lucide-react';
import {
    InvestorOpportunity, OpportunityStatus, OpportunityType,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_TYPE_LABELS,
    investorPortalService, type LocalDaOportunidade, type FotoDaVitrine,
} from '../../services/investorPortalService';
import { ROTULO_DO_PARECER } from '../../utils/imovibParecer';
import { imovibService } from '../../services/imovibService';
import { speService, type SpeEntity } from '../../services/speService';
import { ImovibStudy } from '../../types';
import type { ImovibStudyVersion } from '../../utils/imovibVersoes';
import Button from '../ui/Button';
import MoneyCentsInput from '../ui/MoneyCentsInput';

interface Props {
    initial?: Partial<InvestorOpportunity>;
    organizationId: string;
    onSave: (data: Omit<InvestorOpportunity, 'id' | 'created_at'>) => void;
    onClose: () => void;
}

const STATUSES: OpportunityStatus[] = ['estudo', 'viabilidade', 'lancamento', 'captacao', 'encerrada'];
const TYPES: OpportunityType[] = ['incorporacao', 'loteamento', 'obra_privada', 'obra_publica'];


const OpportunityForm: React.FC<Props> = ({ initial, organizationId, onSave, onClose }) => {
    const [studies, setStudies] = React.useState<ImovibStudy[]>([]);

    // Fase 4: a SPE que recebe o dinheiro (chamado e integralizado vêm dos sócios dela).
    const [spes, setSpes] = React.useState<SpeEntity[]>([]);
    React.useEffect(() => {
        speService.list(organizationId).then(setSpes).catch(err => console.error('Erro ao carregar as SPEs', err));
    }, [organizationId]);

    React.useEffect(() => {
        imovibService.getStudies(organizationId)
            .then(setStudies)
            .catch(err => console.error('Erro ao carregar estudos do IMOVIB', err));
    }, [organizationId]);

    // Sub-estados para gerenciamento de listas dinâmicas no formulário
    const [newDistance, setNewDistance] = React.useState({ place: '', distance: '' });
    const [newMember, setNewMember] = React.useState({ name: '', role: '', experience: '' });
    const [form, setForm] = React.useState<Omit<InvestorOpportunity, 'id' | 'created_at'>>({
        organization_id: organizationId,
        title: initial?.title ?? '',
        subtitle: initial?.subtitle ?? '',
        status: initial?.status ?? 'estudo',
        opportunity_type: initial?.opportunity_type,
        thumbnail_url: initial?.thumbnail_url ?? '',
        ticket_min: initial?.ticket_min ?? null,
        spe_entity_id: initial?.spe_entity_id ?? null,
        is_published: initial?.is_published ?? false,
        imovib_study_id: initial?.imovib_study_id ?? null,
        imovib_version_id: initial?.imovib_version_id ?? null,
        distances_json: initial?.distances_json ?? [],
        team_json: initial?.team_json ?? [],
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm(prev => ({ ...prev, [k]: v }));

    // Plano docs/planos/2026-11-15-imovib-investidor-relatorio-e-dashboard.md, Fase 2: com estudo do
    // Imovib, o investidor vê uma VERSÃO congelada; publicar sem ela o banco recusa.
    const [versoes, setVersoes] = React.useState<ImovibStudyVersion[] | null>(null);
    const [erroDasVersoes, setErroDasVersoes] = React.useState<string | null>(null);
    const [voltouParaRascunho, setVoltouParaRascunho] = React.useState(false);
    React.useEffect(() => {
        if (!form.imovib_study_id) { setVersoes(null); return; }
        let vivo = true;
        setVersoes(null);
        setErroDasVersoes(null);
        imovibService.listarVersoes(form.imovib_study_id)
            .then(l => { if (vivo) setVersoes(l); })
            .catch(err => { if (vivo) { console.error('Erro ao carregar as versões do estudo', err); setVersoes([]); setErroDasVersoes((err as Error).message); } });
        return () => { vivo = false; };
    }, [form.imovib_study_id]);
    // Trocar de estudo limpa a versão; se estava publicada, volta para rascunho (o banco recusaria
    // publicada sem versão) e a tela diz isso. Tirar o estudo não exige versão: continua como está.
    const trocarEstudo = (id: string | null) => {
        const voltou = !!form.is_published && !!id && id !== form.imovib_study_id;
        setVoltouParaRascunho(voltou);
        setForm(prev => ({ ...prev, imovib_study_id: id, imovib_version_id: null, is_published: voltou ? false : prev.is_published }));
    };
    // Fase 2: o que a vitrine LÊ do estudo (local, obra, parecer).
    const [lido, setLido] = React.useState<{ local: LocalDaOportunidade | null; parecer: string | null; empreendimento: string | null; fotos: FotoDaVitrine[] } | null>(null);
    React.useEffect(() => {
        if (!form.imovib_study_id) { setLido(null); return; }
        let vivo = true;
        setLido(null);
        investorPortalService.lidoDoEstudo(form.imovib_study_id, organizationId)
            .then(l => { if (vivo) setLido(l); })
            .catch(err => { if (vivo) { console.error('Erro ao ler o estudo da oportunidade', err); setLido({ local: null, parecer: null, empreendimento: null, fotos: [] }); } });
        return () => { vivo = false; };
    }, [form.imovib_study_id, organizationId]);
    // Publicar: estudo + versão congelada (decisão D4) e parecer que não seja "reprovar" (item 5.2).
    // O banco confere o mesmo (fn_investor_opportunity_versao_valida).
    const motivoSemVersao = !form.imovib_study_id
        ? 'Vincule o estudo do Imovib: o investidor só vê números da versão congelada.'
        : !form.imovib_version_id
            ? 'Escolha a versão congelada do estudo que o investidor vai ver.'
            : lido?.parecer === 'reprovar'
                ? 'O parecer do estudo é "Reprovar": não se publica.'
                : null;
    const avisoDoParecer = lido && lido.parecer !== 'reprovar' && (!lido.parecer || lido.parecer === 'renegociar')
        ? (lido.parecer ? 'O parecer do estudo é "Renegociar".' : 'O estudo ainda não tem parecer do analista.')
        : null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        const finalForm = { ...form };
        // Itens digitados e não adicionados com "+" entram também.
        if (newDistance.place.trim() && newDistance.distance.trim()) finalForm.distances_json = [...(finalForm.distances_json || []), { ...newDistance }];
        if (newMember.name.trim() && newMember.role.trim()) finalForm.team_json = [...(finalForm.team_json || []), { ...newMember }];
        onSave(finalForm);
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-8 pb-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl z-10">
                    <div>
                        <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                            {initial?.id ? 'Editar' : 'Nova'} Oportunidade
                        </span>
                        <h2 className="text-xl font-black text-gray-900 mt-0.5">
                            {initial?.id ? form.title || 'Sem título' : 'Cadastro de Oportunidade'}
                        </h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                    {/* ── Identificação ─────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Identificação</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Título *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.title}
                                    onChange={e => set('title', e.target.value)}
                                    placeholder="Ex: Residencial Vila Nova"
                                    className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Subtítulo / Tagline</label>
                                <input
                                    type="text"
                                    value={form.subtitle ?? ''}
                                    onChange={e => set('subtitle', e.target.value)}
                                    placeholder="Ex: Condomínio fechado alto padrão, 48 unidades"
                                    className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
                                    <select
                                        value={form.status}
                                        onChange={e => set('status', e.target.value as OpportunityStatus)}
                                        className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    >
                                        {STATUSES.map(s => <option key={s} value={s}>{OPPORTUNITY_STATUS_LABELS[s]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tipo</label>
                                    <select
                                        value={form.opportunity_type ?? ''}
                                        onChange={e => set('opportunity_type', (e.target.value || undefined) as OpportunityType | undefined)}
                                        className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    >
                                        <option value="">Selecione...</option>
                                        {TYPES.map(t => <option key={t} value={t}>{OPPORTUNITY_TYPE_LABELS[t]}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="oportunidade-capa" className="block text-xs font-semibold text-slate-500 mb-1.5">Capa</label>
                                <select
                                    id="oportunidade-capa"
                                    value={form.thumbnail_url ?? ''}
                                    onChange={e => set('thumbnail_url', e.target.value)}
                                    disabled={!lido?.fotos?.length && !form.thumbnail_url}
                                    title={!lido?.fotos?.length ? 'As imagens vêm do empreendimento do estudo (decorado, plantas, vistas).' : undefined}
                                    className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:bg-slate-50"
                                >
                                    <option value="">Primeira imagem do empreendimento</option>
                                    {form.thumbnail_url && !lido?.fotos?.some(f => f.url === form.thumbnail_url) && (
                                        <option value={form.thumbnail_url}>Imagem atual (fora do empreendimento)</option>
                                    )}
                                    {(lido?.fotos ?? []).map((f, i) => <option key={`${f.url}-${i}`} value={f.url}>{f.legenda ?? `Imagem ${i + 1}`}</option>)}
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ── Viabilidade Vinculada (IMOVIB) ───────────────────────────────── */}
                    <section className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Viabilidade Vinculada (IMOVIB)</span>
                            <span className="text-xs text-blue-400 ml-1">(opcional)</span>
                        </div>
                        <p className="text-xs text-blue-500 mb-3 leading-relaxed">
                            O investidor vê os números da versão congelada do estudo — VGV, TIR, ROI, prazo, custo,
                            fluxo de caixa, cenários e ficha técnica. Nada disso se digita aqui.
                        </p>
                        <div className="flex items-center gap-2">
                            <select
                                aria-label="Estudo do Imovib"
                                value={form.imovib_study_id ?? ''}
                                onChange={e => trocarEstudo(e.target.value || null)}
                                className="flex-1 px-4 h-9 border border-blue-200 rounded-[6px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400"
                            >
                                <option value="">Sem vínculo</option>
                                {studies.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} (v{s.version})</option>
                                ))}
                            </select>
                            {form.imovib_study_id && (
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    type="button"
                                    onClick={() => trocarEstudo(null)}
                                    title="Desvincular"
                                    className="text-blue-400 hover:text-red-500 hover:bg-red-50 border-blue-200"
                                >
                                    <Unlink className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                        {form.imovib_study_id && (
                            <div className="mt-4 space-y-1.5">
                                <label htmlFor="oportunidade-versao" className="block text-xs font-semibold text-slate-500">Versão que o investidor vê</label>
                                <select
                                    id="oportunidade-versao"
                                    value={form.imovib_version_id ?? ''}
                                    onChange={e => { set('imovib_version_id', e.target.value || null); setVoltouParaRascunho(false); }}
                                    disabled={versoes == null}
                                    className="w-full px-4 h-9 border border-blue-200 rounded-[6px] text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 disabled:bg-slate-50"
                                >
                                    <option value="">{versoes == null ? 'Lendo as versões…' : 'Escolha a versão'}</option>
                                    {(versoes ?? []).map(v => (
                                        <option key={v.id} value={v.id}>{v.label} · {new Date(v.created_at).toLocaleDateString('pt-BR')}</option>
                                    ))}
                                </select>
                                {erroDasVersoes && (
                                    <p className="text-xs text-red-700">Não foi possível ler as versões do estudo: {erroDasVersoes}</p>
                                )}
                                {versoes?.length === 0 && !erroDasVersoes && (
                                    <p className="text-xs text-amber-700">Este estudo ainda não tem versão congelada: congele uma na aba Versões do estudo.</p>
                                )}
                                <p className="text-xs text-blue-500">O investidor vê os números desta versão; editar o estudo depois não muda o que ele recebeu.</p>
                            </div>
                        )}
                        {voltouParaRascunho && (
                            <p className="mt-2 text-xs text-amber-700">Voltou para rascunho: escolha a versão do novo estudo para publicar de novo.</p>
                        )}
                    </section>

                    {/* ── Lido do estudo (plano 2026-11-21-imovib-oportunidades-consolidacao, Fase 2) ── */}
                    <section className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                        <p className="text-sm font-semibold text-slate-800">Do estudo e do empreendimento (não se digita aqui)</p>
                        {!form.imovib_study_id ? (
                            <p className="text-xs text-slate-500">Sem estudo vinculado: a oportunidade fica como rascunho, sem números. Para publicar, vincule o estudo e escolha a versão.</p>
                        ) : lido == null ? (
                            <p className="text-xs text-slate-500">Lendo o estudo…</p>
                        ) : (
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <dt className="text-slate-500">Empreendimento</dt><dd className="text-slate-900">{lido.empreendimento ?? 'Nenhum ligado a este estudo'}</dd>
                                <dt className="text-slate-500">Local</dt><dd className="text-slate-900">{[lido.local?.cidade, lido.local?.uf].filter(Boolean).join(', ') || '—'}</dd>
                                <dt className="text-slate-500">Obra ao vivo</dt><dd className="text-slate-900">{lido.local?.obra_id ? 'Obra principal do empreendimento' : 'Empreendimento sem obra'}</dd>
                                <dt className="text-slate-500">Parecer do analista</dt><dd className="text-slate-900">{lido.parecer ? (ROTULO_DO_PARECER as Record<string, string>)[lido.parecer] ?? lido.parecer : 'Não registrado'}</dd>
                            </dl>
                        )}
                        <p className="text-xs text-slate-500">VGV, TIR, ROI, prazo, custo e ficha técnica vêm da versão escolhida acima.</p>
                    </section>
                    {/* ── Distâncias de Pontos de Interesse ──────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <MapPin className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Distâncias Inteligentes (Localização)</span>
                        </div>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newDistance.place}
                                    onChange={e => setNewDistance(prev => ({ ...prev, place: e.target.value }))}
                                    placeholder="Local (Ex: Shopping Cambuí, Aeroporto, etc.)"
                                    className="flex-1 px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                                <input
                                    type="text"
                                    value={newDistance.distance}
                                    onChange={e => setNewDistance(prev => ({ ...prev, distance: e.target.value }))}
                                    placeholder="Ex: 500m / 5 min"
                                    className="w-40 px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                                <Button
                                    size="icon"
                                    type="button"
                                    onClick={() => {
                                        if (newDistance.place.trim() && newDistance.distance.trim()) {
                                            set('distances_json', [...(form.distances_json || []), { ...newDistance }]);
                                            setNewDistance({ place: '', distance: '' });
                                        }
                                    }}
                                >
                                    <Plus className="w-5 h-5" />
                                </Button>
                            </div>
                            {form.distances_json && form.distances_json.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {form.distances_json.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-150 text-xs">
                                            <span className="text-gray-700 font-bold">{item.place}</span>
                                            <span className="text-gray-400 font-medium">•</span>
                                            <span className="text-blue-600 font-black">{item.distance}</span>
                                            <button
                                                type="button"
                                                onClick={() => set('distances_json', (form.distances_json || []).filter((_, i) => i !== idx))}
                                                className="text-red-500 hover:text-red-700 transition-colors font-bold ml-1"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── Equipe ─────────────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Equipe / Sócios / Construtora</span>
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <input
                                    type="text"
                                    value={newMember.name}
                                    onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Nome (Ex: Dr. Silva, Alfa Construtora)"
                                    className="px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <input
                                    type="text"
                                    value={newMember.role}
                                    onChange={e => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                                    placeholder="Função (Ex: Diretor de RI, Construtora)"
                                    className="px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newMember.experience}
                                        onChange={e => setNewMember(prev => ({ ...prev, experience: e.target.value }))}
                                        placeholder="Experiência (Ex: 15 anos de mercado)"
                                        className="flex-1 px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                    <Button
                                        size="icon"
                                        type="button"
                                        onClick={() => {
                                            if (newMember.name.trim() && newMember.role.trim()) {
                                                set('team_json', [...(form.team_json || []), { ...newMember }]);
                                                setNewMember({ name: '', role: '', experience: '' });
                                            }
                                        }}
                                        className="rounded-xl transition-all"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>
                            {form.team_json && form.team_json.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {form.team_json.map((member, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-150 text-xs">
                                            <div>
                                                <p className="font-bold text-gray-800">{member.name}</p>
                                                <p className="text-gray-400 font-semibold">{member.role} {member.experience ? `• ${member.experience}` : ''}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => set('team_json', (form.team_json || []).filter((_, i) => i !== idx))}
                                                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>


                    {/* ── Captação: ticket mínimo (regra comercial) e a SPE que recebe o dinheiro (Fase 4) ── */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="oportunidade-spe" className="block text-xs font-semibold text-slate-500 mb-1.5">SPE da captação</label>
                            <select
                                id="oportunidade-spe"
                                value={form.spe_entity_id ?? ''}
                                onChange={e => set('spe_entity_id', e.target.value || null)}
                                className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                            >
                                <option value="">{spes.length ? 'Sem SPE (captação não acompanhada)' : 'Nenhuma SPE nesta organização'}</option>
                                {spes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <p className="text-xs text-slate-500 mt-1">A meta vem do estudo; o captado, dos sócios desta SPE (Investidor › SPEs).</p>
                        </div>
                        <div>
                        <label htmlFor="oportunidade-ticket" className="block text-xs font-semibold text-slate-500 mb-1.5">Ticket mínimo (R$)</label>
                        <MoneyCentsInput
                            id="oportunidade-ticket"
                            value={form.ticket_min}
                            onChange={v => set('ticket_min', v === '' ? null : Number(v))}
                            placeholder="0,00"
                            className="w-full px-4 h-9 border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                        />
                        </div>
                    </section>
                    {/* ── Publicação ───────────────────────────────────── */}
                    <section className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                        <div>
                            <p className="text-sm font-bold text-gray-900">Visível para investidores</p>
                            <p className="text-xs text-gray-500 mt-0.5">Rascunhos não aparecem no portal</p>
                            {avisoDoParecer && <p className="text-xs text-amber-700 mt-1">{avisoDoParecer}</p>}
                        </div>
                        {/* Desligado, o botão não mostra o title: o motivo fica no invólucro. */}
                        <span title={!form.is_published && motivoSemVersao ? motivoSemVersao : undefined}>
                        <button
                            type="button"
                            onClick={() => { set('is_published', !form.is_published); setVoltouParaRascunho(false); }}
                            disabled={!form.is_published && !!motivoSemVersao}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${form.is_published
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                }`}
                        >
                            {form.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            {form.is_published ? 'Publicado' : 'Rascunho'}
                        </button>
                        </span>
                    </section>
                    {/* ── Ações ─────────────────────────────────────────── */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            type="submit"
                            className="flex-1 rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                        >
                            {initial?.id ? 'Salvar alterações' : 'Criar oportunidade'}
                        </Button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 text-gray-500 hover:text-gray-700 font-bold rounded-2xl hover:bg-gray-100 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OpportunityForm;
