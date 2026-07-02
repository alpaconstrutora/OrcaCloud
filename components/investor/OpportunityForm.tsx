import React from 'react';
import { X, Building2, MapPin, BarChart3, Ruler, Eye, EyeOff, TrendingDown, TrendingUp, SlidersHorizontal, Link2, Unlink, Plus, Trash2, Users, Upload } from 'lucide-react';
import {
    InvestorOpportunity, OpportunityStatus, OpportunityType,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_TYPE_LABELS,
    OpportunityCompetitor, investorPortalService
} from '../../services/investorPortalService';
import { opportunityProjectService } from '../../services/opportunityProjectService';
import { imovibService } from '../../services/imovibService';
import { ImovibStudy } from '../../types';
import { storageService } from '../../services/storageService';
import Button from '../ui/Button';

interface Props {
    initial?: Partial<InvestorOpportunity>;
    organizationId: string;
    onSave: (
        data: Omit<InvestorOpportunity, 'id' | 'created_at'>,
        competitors: Omit<OpportunityCompetitor, 'id' | 'created_at' | 'opportunity_id'>[]
    ) => void;
    onClose: () => void;
}

const STATUSES: OpportunityStatus[] = ['estudo', 'viabilidade', 'lancamento', 'captacao', 'encerrada'];
const TYPES: OpportunityType[] = ['incorporacao', 'loteamento', 'obra_privada', 'obra_publica'];

const fmtNum = (v: number | null | undefined) => (v != null ? String(v) : '');
const parseNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

const OpportunityForm: React.FC<Props> = ({ initial, organizationId, onSave, onClose }) => {
    const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
    const [studies, setStudies] = React.useState<ImovibStudy[]>([]);

    React.useEffect(() => {
        opportunityProjectService.listForOrg(organizationId)
            .then(setProjects)
            .catch(() => {/* silencioso — seletor fica vazio */});
            
        imovibService.getStudies(organizationId)
            .then(setStudies)
            .catch(err => console.error('Erro ao carregar estudos do IMOVIB', err));
    }, [organizationId]);

    // Concorrentes de Mercado
    const [competitors, setCompetitors] = React.useState<Omit<OpportunityCompetitor, 'id' | 'created_at' | 'opportunity_id'>[]>([]);
    const [newCompetitor, setNewCompetitor] = React.useState({
        name: '',
        price_per_m2: '',
        sales_velocity_pct: '',
        appreciation_pct: '',
        distance_km: '',
    });

    React.useEffect(() => {
        if (initial?.id) {
            investorPortalService.listCompetitors(initial.id)
                .then(setCompetitors)
                .catch(err => console.error('Erro ao carregar concorrentes', err));
        }
    }, [initial?.id]);

    // Sub-estados para gerenciamento de listas dinâmicas no formulário
    const [newUrl, setNewUrl] = React.useState('');
    const [newDistance, setNewDistance] = React.useState({ place: '', distance: '' });
    const [newRisk, setNewRisk] = React.useState({ title: '', probability: 'Média', impact: 'Médio', mitigation: '' });
    const [newMember, setNewMember] = React.useState({ name: '', role: '', experience: '' });
    const [form, setForm] = React.useState<Omit<InvestorOpportunity, 'id' | 'created_at'>>({
        organization_id: organizationId,
        title: initial?.title ?? '',
        subtitle: initial?.subtitle ?? '',
        status: initial?.status ?? 'estudo',
        opportunity_type: initial?.opportunity_type,
        location_city: initial?.location_city ?? '',
        location_state: initial?.location_state ?? '',
        thumbnail_url: initial?.thumbnail_url ?? '',
        land_area_m2: initial?.land_area_m2 ?? null,
        built_area_m2: initial?.built_area_m2 ?? null,
        floors: initial?.floors ?? null,
        vgv: initial?.vgv ?? null,
        roi_pct: initial?.roi_pct ?? null,
        tir_pct: initial?.tir_pct ?? null,
        cost_estimate: initial?.cost_estimate ?? null,
        cost_per_m2: initial?.cost_per_m2 ?? null,
        ticket_min: initial?.ticket_min ?? null,
        expected_start: initial?.expected_start ?? null,
        projected_yield: initial?.projected_yield ?? '',
        is_published: initial?.is_published ?? false,
        project_id: initial?.project_id ?? null,
        duration_months: initial?.duration_months ?? null,
        scenario_cost_cons_pct: initial?.scenario_cost_cons_pct ?? null,
        scenario_vgv_cons_pct: initial?.scenario_vgv_cons_pct ?? null,
        scenario_cost_opt_pct: initial?.scenario_cost_opt_pct ?? null,
        scenario_vgv_opt_pct: initial?.scenario_vgv_opt_pct ?? null,
        scenario_notes: initial?.scenario_notes ?? '',
        imovib_study_id: initial?.imovib_study_id ?? null,
        target_funding_value: initial?.target_funding_value ?? null,
        current_funding_value: initial?.current_funding_value ?? null,
        gallery_urls: initial?.gallery_urls ?? [],
        distances_json: initial?.distances_json ?? [],
        risks_json: initial?.risks_json ?? [],
        team_json: initial?.team_json ?? [],
        simulation_params_json: initial?.simulation_params_json ?? {},
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm(prev => ({ ...prev, [k]: v }));

    // Estados para upload da Galeria
    const [dragOver, setDragOver] = React.useState(false);
    const [uploadingGallery, setUploadingGallery] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const uploadFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploadingGallery(true);
        try {
            const urls: string[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const path = `gallery/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                await storageService.uploadFile('documents', path, file);
                const url = storageService.getPublicUrl('documents', path);
                urls.push(url);
            }
            setForm(prev => ({ ...prev, gallery_urls: [...(prev.gallery_urls || []), ...urls] }));
        } catch (err) {
            console.error('Erro ao fazer upload dos arquivos da galeria:', err);
            alert('Erro ao enviar imagens.');
        } finally {
            setUploadingGallery(false);
        }
    };

    const handleDropGallery = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        uploadFiles(e.dataTransfer.files);
    };

    const handleFileInputGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
        uploadFiles(e.target.files);
        e.target.value = '';
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) return;

        const finalForm = { ...form };
        const finalCompetitors = [...competitors];

        // Auto-adicionar itens pendentes nos inputs se o usuário esqueceu de clicar no botão "+"
        if (newUrl.trim()) {
            finalForm.gallery_urls = [...(finalForm.gallery_urls || []), newUrl.trim()];
        }
        if (newDistance.place.trim() && newDistance.distance.trim()) {
            finalForm.distances_json = [...(finalForm.distances_json || []), { ...newDistance }];
        }
        if (newRisk.title.trim()) {
            finalForm.risks_json = [...(finalForm.risks_json || []), { ...newRisk }];
        }
        if (newMember.name.trim() && newMember.role.trim()) {
            finalForm.team_json = [...(finalForm.team_json || []), { ...newMember }];
        }
        if (newCompetitor.name.trim() && newCompetitor.price_per_m2.trim()) {
            finalCompetitors.push({
                name: newCompetitor.name.trim(),
                price_per_m2: Number(newCompetitor.price_per_m2.replace(',', '.')),
                sales_velocity_pct: newCompetitor.sales_velocity_pct ? Number(newCompetitor.sales_velocity_pct.replace(',', '.')) : null,
                appreciation_pct: newCompetitor.appreciation_pct ? Number(newCompetitor.appreciation_pct.replace(',', '.')) : null,
                distance_km: newCompetitor.distance_km ? Number(newCompetitor.distance_km.replace(',', '.')) : null,
                organization_id: organizationId,
            });
        }

        onSave(finalForm, finalCompetitors);
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
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Título *</label>
                                <input
                                    type="text"
                                    required
                                    value={form.title}
                                    onChange={e => set('title', e.target.value)}
                                    placeholder="Ex: Residencial Vila Nova"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Subtítulo / Tagline</label>
                                <input
                                    type="text"
                                    value={form.subtitle ?? ''}
                                    onChange={e => set('subtitle', e.target.value)}
                                    placeholder="Ex: Condomínio fechado alto padrão, 48 unidades"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">Status</label>
                                    <select
                                        value={form.status}
                                        onChange={e => set('status', e.target.value as OpportunityStatus)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    >
                                        {STATUSES.map(s => <option key={s} value={s}>{OPPORTUNITY_STATUS_LABELS[s]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">Tipo</label>
                                    <select
                                        value={form.opportunity_type ?? ''}
                                        onChange={e => set('opportunity_type', (e.target.value || undefined) as OpportunityType | undefined)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    >
                                        <option value="">Selecione...</option>
                                        {TYPES.map(t => <option key={t} value={t}>{OPPORTUNITY_TYPE_LABELS[t]}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">URL da imagem / thumbnail</label>
                                <input
                                    type="url"
                                    value={form.thumbnail_url ?? ''}
                                    onChange={e => set('thumbnail_url', e.target.value)}
                                    placeholder="https://..."
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Obra Vinculada ───────────────────────────────── */}
                    <section className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Link2 className="w-4 h-4 text-indigo-600" />
                            <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Obra vinculada</span>
                            <span className="text-xs text-indigo-400 ml-1">(opcional)</span>
                        </div>
                        <p className="text-xs text-indigo-500 mb-3 leading-relaxed">
                            Vincule a uma obra real do ORÇACLOUD para exibir dados ao vivo: progresso físico,
                            custo realizado, timeline e galeria de fotos.
                        </p>
                        <div className="flex items-center gap-2">
                            <select
                                value={form.project_id ?? ''}
                                onChange={e => set('project_id', e.target.value || null)}
                                className="flex-1 px-4 py-2.5 border border-indigo-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                            >
                                <option value="">Sem vínculo</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            {form.project_id && (
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    type="button"
                                    onClick={() => set('project_id', null)}
                                    title="Desvincular"
                                    className="text-indigo-400 hover:text-red-500 hover:bg-red-50 border-indigo-200"
                                >
                                    <Unlink className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                        {form.project_id && (
                            <p className="text-xs text-indigo-500 mt-2 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                Dados ao vivo serão exibidos na aba "Obra" do pitch
                            </p>
                        )}
                    </section>

                    {/* ── Viabilidade Vinculada (IMOVIB) ───────────────────────────────── */}
                    <section className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Viabilidade Vinculada (IMOVIB)</span>
                            <span className="text-xs text-blue-400 ml-1">(opcional)</span>
                        </div>
                        <p className="text-xs text-blue-500 mb-3 leading-relaxed">
                            Vincule a um estudo de viabilidade do IMOVIB para preencher e calcular dinamicamente dados financeiros:
                            TIR, VPL, ROI, Payback, Fluxo de Caixa e cenários de sensibilidade.
                        </p>
                        <div className="flex items-center gap-2">
                            <select
                                value={form.imovib_study_id ?? ''}
                                onChange={e => set('imovib_study_id', e.target.value || null)}
                                className="flex-1 px-4 py-2.5 border border-blue-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400"
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
                                    onClick={() => set('imovib_study_id', null)}
                                    title="Desvincular"
                                    className="text-blue-400 hover:text-red-500 hover:bg-red-50 border-blue-200"
                                >
                                    <Unlink className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </section>

                    {/* ── Captação de Recursos ─────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <BarChart3 className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Captação de Recursos</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Meta de Captação (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.target_funding_value)}
                                    onChange={e => set('target_funding_value', parseNum(e.target.value))}
                                    placeholder="Ex: 42500000"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Valor Já Captado (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.current_funding_value)}
                                    onChange={e => set('current_funding_value', parseNum(e.target.value))}
                                    placeholder="Ex: 30600000"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Galeria Premium ───────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Upload className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Galeria Premium (Fotos e Renders)</span>
                        </div>
                        <div className="space-y-3">
                            <div 
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDropGallery}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${dragOver
                                    ? 'border-blue-400 bg-blue-50/50'
                                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
                                }`}
                            >
                                <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                                <p className="text-xs font-bold text-gray-600">
                                    {uploadingGallery ? 'Enviando arquivos...' : (dragOver ? 'Solte as imagens aqui' : 'Arraste imagens ou clique para selecionar')}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-1">Imagens de renders, plantas e fotos (PNG, JPG, WEBP) - até 20MB</p>
                                <input 
                                    ref={fileInputRef} 
                                    type="file" 
                                    multiple 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={handleFileInputGallery} 
                                />
                            </div>
                            
                            {uploadingGallery && (
                                <div className="space-y-1 bg-blue-50/50 rounded-xl p-3 border border-blue-100 flex items-center justify-center gap-2 text-xs text-blue-600 font-bold">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                    <span>Fazendo upload das imagens para o Storage...</span>
                                </div>
                            )}

                            {form.gallery_urls && form.gallery_urls.length > 0 && (
                                <div className="grid grid-cols-3 gap-3 mt-2">
                                    {form.gallery_urls.map((url, idx) => (
                                        <div key={idx} className="relative rounded-xl overflow-hidden border border-gray-150 aspect-video group bg-gray-50">
                                            <img src={url} alt={`Render ${idx + 1}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Button
                                                    variant="danger"
                                                    size="icon"
                                                    type="button"
                                                    onClick={() => set('gallery_urls', (form.gallery_urls || []).filter((_, i) => i !== idx))}
                                                    className="rounded-lg shadow-lg"
                                                    title="Excluir imagem"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
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
                                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                                <input
                                    type="text"
                                    value={newDistance.distance}
                                    onChange={e => setNewDistance(prev => ({ ...prev, distance: e.target.value }))}
                                    placeholder="Ex: 500m / 5 min"
                                    className="w-40 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
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

                    {/* ── Matriz de Riscos ────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Matriz de Riscos</span>
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={newRisk.title}
                                    onChange={e => setNewRisk(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Risco (Ex: Licenciamento, Custo de Aço)"
                                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <input
                                    type="text"
                                    value={newRisk.mitigation}
                                    onChange={e => setNewRisk(prev => ({ ...prev, mitigation: e.target.value }))}
                                    placeholder="Mitigação (Ex: Projeto aprovado, Contrato fechado)"
                                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                            </div>
                            <div className="flex gap-2 items-center">
                                <div className="flex-1 flex gap-2">
                                    <select
                                        value={newRisk.probability}
                                        onChange={e => setNewRisk(prev => ({ ...prev, probability: e.target.value }))}
                                        className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none"
                                    >
                                        <option value="Baixa">Probabilidade: Baixa</option>
                                        <option value="Média">Probabilidade: Média</option>
                                        <option value="Alta">Probabilidade: Alta</option>
                                    </select>
                                    <select
                                        value={newRisk.impact}
                                        onChange={e => setNewRisk(prev => ({ ...prev, impact: e.target.value }))}
                                        className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none"
                                    >
                                        <option value="Baixo">Impacto: Baixo</option>
                                        <option value="Médio">Impacto: Médio</option>
                                        <option value="Alto">Impacto: Alto</option>
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (newRisk.title.trim()) {
                                            set('risks_json', [...(form.risks_json || []), { ...newRisk }]);
                                            setNewRisk({ title: '', probability: 'Média', impact: 'Médio', mitigation: '' });
                                        }
                                    }}
                                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                            {form.risks_json && form.risks_json.length > 0 && (
                                <div className="border border-gray-150 rounded-2xl overflow-hidden mt-2">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider">
                                            <tr>
                                                <th className="p-3">Risco</th>
                                                <th className="p-3">Prob. / Impacto</th>
                                                <th className="p-3">Mitigação</th>
                                                <th className="p-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 font-medium">
                                            {form.risks_json.map((r, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="p-3 font-bold text-gray-800">{r.title}</td>
                                                    <td className="p-3">
                                                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-bold mr-1">{r.probability}</span>
                                                        <span className={`px-2 py-0.5 rounded-md font-bold ${r.impact === 'Alto' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{r.impact}</span>
                                                    </td>
                                                    <td className="p-3 text-gray-600">{r.mitigation}</td>
                                                    <td className="p-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => set('risks_json', (form.risks_json || []).filter((_, i) => i !== idx))}
                                                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                 </tr>
                                            ))}
                                        </tbody>
                                    </table>
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
                                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <input
                                    type="text"
                                    value={newMember.role}
                                    onChange={e => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                                    placeholder="Função (Ex: Diretor de RI, Construtora)"
                                    className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newMember.experience}
                                        onChange={e => setNewMember(prev => ({ ...prev, experience: e.target.value }))}
                                        placeholder="Experiência (Ex: 15 anos de mercado)"
                                        className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (newMember.name.trim() && newMember.role.trim()) {
                                                set('team_json', [...(form.team_json || []), { ...newMember }]);
                                                setNewMember({ name: '', role: '', experience: '' });
                                            }
                                        }}
                                        className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
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


                    {/* ── Comparativo de Mercado (Concorrentes) ─────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Comparativo de Mercado (Concorrentes Locais)</span>
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <input
                                    type="text"
                                    value={newCompetitor.name}
                                    onChange={e => setNewCompetitor(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Nome do Concorrente (Ex: Alfa Cambuí)"
                                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <input
                                    type="text"
                                    value={newCompetitor.price_per_m2}
                                    onChange={e => setNewCompetitor(prev => ({ ...prev, price_per_m2: e.target.value }))}
                                    placeholder="Preço médio/m² (Ex: 12500)"
                                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <input
                                    type="text"
                                    value={newCompetitor.sales_velocity_pct}
                                    onChange={e => setNewCompetitor(prev => ({ ...prev, sales_velocity_pct: e.target.value }))}
                                    placeholder="Venda mensal % (Ex: 4.5)"
                                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <input
                                    type="text"
                                    value={newCompetitor.appreciation_pct}
                                    onChange={e => setNewCompetitor(prev => ({ ...prev, appreciation_pct: e.target.value }))}
                                    placeholder="Valorização anual % (Ex: 12.0)"
                                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                                <input
                                    type="text"
                                    value={newCompetitor.distance_km}
                                    onChange={e => setNewCompetitor(prev => ({ ...prev, distance_km: e.target.value }))}
                                    placeholder="Distância km (Ex: 1.2)"
                                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (newCompetitor.name.trim() && newCompetitor.price_per_m2.trim()) {
                                            setCompetitors(prev => [
                                                ...prev,
                                                {
                                                    name: newCompetitor.name.trim(),
                                                    price_per_m2: Number(newCompetitor.price_per_m2.replace(',', '.')),
                                                    sales_velocity_pct: newCompetitor.sales_velocity_pct ? Number(newCompetitor.sales_velocity_pct.replace(',', '.')) : null,
                                                    appreciation_pct: newCompetitor.appreciation_pct ? Number(newCompetitor.appreciation_pct.replace(',', '.')) : null,
                                                    distance_km: newCompetitor.distance_km ? Number(newCompetitor.distance_km.replace(',', '.')) : null,
                                                    organization_id: organizationId,
                                                }
                                            ]);
                                            setNewCompetitor({ name: '', price_per_m2: '', sales_velocity_pct: '', appreciation_pct: '', distance_km: '' });
                                        }
                                    }}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all text-xs font-bold flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" />
                                    Adicionar Concorrente
                                </button>
                            </div>

                            {competitors && competitors.length > 0 && (
                                <div className="border border-gray-150 rounded-2xl overflow-hidden mt-2">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider">
                                            <tr>
                                                <th className="p-3">Concorrente</th>
                                                <th className="p-3">Preço/m²</th>
                                                <th className="p-3">Vendas/mês</th>
                                                <th className="p-3">Valoriz. Anual</th>
                                                <th className="p-3">Distância</th>
                                                <th className="p-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 font-medium">
                                            {competitors.map((c, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="p-3 font-bold text-gray-800">{c.name}</td>
                                                    <td className="p-3 font-mono text-gray-700">R$ {c.price_per_m2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="p-3 text-gray-600">{c.sales_velocity_pct != null ? `${c.sales_velocity_pct}%` : '-'}</td>
                                                    <td className="p-3 text-gray-600">{c.appreciation_pct != null ? `${c.appreciation_pct}%` : '-'}</td>
                                                    <td className="p-3 text-gray-600">{c.distance_km != null ? `${c.distance_km} km` : '-'}</td>
                                                    <td className="p-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCompetitors(prev => prev.filter((_, i) => i !== idx))}
                                                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>


                    {/* ── Localização ───────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <MapPin className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Localização</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Cidade</label>
                                <input
                                    type="text"
                                    value={form.location_city ?? ''}
                                    onChange={e => set('location_city', e.target.value)}
                                    placeholder="Ex: São Paulo"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Estado</label>
                                <input
                                    type="text"
                                    value={form.location_state ?? ''}
                                    onChange={e => set('location_state', e.target.value)}
                                    placeholder="Ex: SP"
                                    maxLength={2}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 uppercase"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Dados Técnicos ────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Ruler className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Dados Técnicos</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Área do terreno (m²)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.land_area_m2)}
                                    onChange={e => set('land_area_m2', parseNum(e.target.value))}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Área construída (m²)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.built_area_m2)}
                                    onChange={e => set('built_area_m2', parseNum(e.target.value))}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Pavimentos</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.floors)}
                                    onChange={e => set('floors', parseNum(e.target.value) != null ? Math.round(parseNum(e.target.value)!) : null)}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Previsão de início</label>
                                <input
                                    type="date"
                                    value={form.expected_start ?? ''}
                                    onChange={e => set('expected_start', e.target.value || null)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Financeiro ────────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <BarChart3 className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Dados Financeiros</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">VGV (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.vgv)}
                                    onChange={e => set('vgv', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Custo estimado (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.cost_estimate)}
                                    onChange={e => set('cost_estimate', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Custo/m² (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.cost_per_m2)}
                                    onChange={e => set('cost_per_m2', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Ticket mínimo (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.ticket_min)}
                                    onChange={e => set('ticket_min', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">ROI estimado (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={fmtNum(form.roi_pct)}
                                    onChange={e => set('roi_pct', parseNum(e.target.value))}
                                    placeholder="0,0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">TIR estimada (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={fmtNum(form.tir_pct)}
                                    onChange={e => set('tir_pct', parseNum(e.target.value))}
                                    placeholder="0,0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Cenários de Viabilidade ──────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Cenários de Viabilidade</span>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">
                            Defina as variações para os cenários conservador e otimista em relação aos dados base.
                            Percentuais positivos = aumento; negativos = redução.
                        </p>

                        <div className="grid grid-cols-1 gap-3">
                            {/* Duração */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-form-label font-bold text-gray-600 mb-1.5">Duração prevista (meses)</label>
                                    <input
                                        type="number"
                                        value={fmtNum(form.duration_months)}
                                        onChange={e => set('duration_months', parseNum(e.target.value) != null ? Math.round(parseNum(e.target.value)!) : null)}
                                        placeholder="Ex: 24"
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    />
                                </div>
                            </div>

                            {/* Conservador */}
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                                    <span className="text-xs font-black text-red-600 uppercase tracking-wider">Cenário Conservador</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-form-label font-bold text-gray-500 mb-1.5">Custo sobe (%) <span className="font-normal text-gray-400">ex: 15</span></label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={fmtNum(form.scenario_cost_cons_pct)}
                                            onChange={e => set('scenario_cost_cons_pct', parseNum(e.target.value))}
                                            placeholder="15"
                                            className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-form-label font-bold text-gray-500 mb-1.5">VGV cai (%) <span className="font-normal text-gray-400">ex: 10</span></label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={fmtNum(form.scenario_vgv_cons_pct)}
                                            onChange={e => set('scenario_vgv_cons_pct', parseNum(e.target.value))}
                                            placeholder="10"
                                            className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Otimista */}
                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-3">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Cenário Otimista</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-form-label font-bold text-gray-500 mb-1.5">Custo cai (%) <span className="font-normal text-gray-400">ex: 5</span></label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={fmtNum(form.scenario_cost_opt_pct)}
                                            onChange={e => set('scenario_cost_opt_pct', parseNum(e.target.value))}
                                            placeholder="5"
                                            className="w-full px-3 py-2 border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-form-label font-bold text-gray-500 mb-1.5">VGV sobe (%) <span className="font-normal text-gray-400">ex: 8</span></label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={fmtNum(form.scenario_vgv_opt_pct)}
                                            onChange={e => set('scenario_vgv_opt_pct', parseNum(e.target.value))}
                                            placeholder="8"
                                            className="w-full px-3 py-2 border border-emerald-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/30 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Notas/premissas */}
                            <div>
                                <label className="block text-form-label font-bold text-gray-600 mb-1.5">Premissas e observações</label>
                                <textarea
                                    rows={2}
                                    value={form.scenario_notes ?? ''}
                                    onChange={e => set('scenario_notes', e.target.value)}
                                    placeholder="Ex: Custo inclui terreno. VGV baseado em pesquisa de mercado jun/2026."
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                                />
                            </div>
                        </div>
                    </section>

                    {/* ── Publicação ───────────────────────────────────── */}
                    <section className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                        <div>
                            <p className="text-sm font-bold text-gray-900">Visível para investidores</p>
                            <p className="text-xs text-gray-500 mt-0.5">Rascunhos não aparecem no portal</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => set('is_published', !form.is_published)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${form.is_published
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                }`}
                        >
                            {form.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            {form.is_published ? 'Publicado' : 'Rascunho'}
                        </button>
                    </section>

                    {/* ── Ações ─────────────────────────────────────────── */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="submit"
                            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-blue-600/20"
                        >
                            {initial?.id ? 'Salvar alterações' : 'Criar oportunidade'}
                        </button>
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
