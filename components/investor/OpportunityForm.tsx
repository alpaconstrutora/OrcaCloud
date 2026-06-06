import React from 'react';
import { X, Building2, MapPin, BarChart3, Ruler, Eye, EyeOff, TrendingDown, TrendingUp, SlidersHorizontal, Link2, Unlink } from 'lucide-react';
import {
    InvestorOpportunity, OpportunityStatus, OpportunityType,
    OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_TYPE_LABELS,
} from '../../services/investorPortalService';
import { opportunityProjectService } from '../../services/opportunityProjectService';

interface Props {
    initial?: Partial<InvestorOpportunity>;
    organizationId: string;
    onSave: (data: Omit<InvestorOpportunity, 'id' | 'created_at'>) => void;
    onClose: () => void;
}

const STATUSES: OpportunityStatus[] = ['estudo', 'viabilidade', 'lancamento', 'captacao', 'encerrada'];
const TYPES: OpportunityType[] = ['incorporacao', 'loteamento', 'obra_privada', 'obra_publica'];

const fmtNum = (v: number | null | undefined) => (v != null ? String(v) : '');
const parseNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

const OpportunityForm: React.FC<Props> = ({ initial, organizationId, onSave, onClose }) => {
    const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);

    React.useEffect(() => {
        opportunityProjectService.listForOrg(organizationId)
            .then(setProjects)
            .catch(() => {/* silencioso — seletor fica vazio */});
    }, [organizationId]);

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
    });

    const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
        setForm(prev => ({ ...prev, [k]: v }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) return;
        onSave(form);
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
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                            {initial?.id ? 'Editar' : 'Nova'} Oportunidade
                        </span>
                        <h2 className="text-xl font-black text-gray-900 mt-0.5">
                            {initial?.id ? form.title || 'Sem título' : 'Cadastro de Oportunidade'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Título *</label>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Subtítulo / Tagline</label>
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
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Status</label>
                                    <select
                                        value={form.status}
                                        onChange={e => set('status', e.target.value as OpportunityStatus)}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                    >
                                        {STATUSES.map(s => <option key={s} value={s}>{OPPORTUNITY_STATUS_LABELS[s]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Tipo</label>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">URL da imagem / thumbnail</label>
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
                            <span className="text-[10px] text-indigo-400 ml-1">(opcional)</span>
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
                                <button
                                    type="button"
                                    onClick={() => set('project_id', null)}
                                    title="Desvincular"
                                    className="p-2.5 text-indigo-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-indigo-200 bg-white"
                                >
                                    <Unlink className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {form.project_id && (
                            <p className="text-[10px] text-indigo-500 mt-2 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                Dados ao vivo serão exibidos na aba "Obra" do pitch
                            </p>
                        )}
                    </section>

                    {/* ── Localização ───────────────────────────────────── */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <MapPin className="w-4 h-4 text-blue-600" />
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Localização</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Cidade</label>
                                <input
                                    type="text"
                                    value={form.location_city ?? ''}
                                    onChange={e => set('location_city', e.target.value)}
                                    placeholder="Ex: São Paulo"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Estado</label>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Área do terreno (m²)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.land_area_m2)}
                                    onChange={e => set('land_area_m2', parseNum(e.target.value))}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Área construída (m²)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.built_area_m2)}
                                    onChange={e => set('built_area_m2', parseNum(e.target.value))}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Pavimentos</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.floors)}
                                    onChange={e => set('floors', parseNum(e.target.value) != null ? Math.round(parseNum(e.target.value)!) : null)}
                                    placeholder="0"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Previsão de início</label>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">VGV (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.vgv)}
                                    onChange={e => set('vgv', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Custo estimado (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.cost_estimate)}
                                    onChange={e => set('cost_estimate', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Custo/m² (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.cost_per_m2)}
                                    onChange={e => set('cost_per_m2', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Ticket mínimo (R$)</label>
                                <input
                                    type="number"
                                    value={fmtNum(form.ticket_min)}
                                    onChange={e => set('ticket_min', parseNum(e.target.value))}
                                    placeholder="0,00"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">ROI estimado (%)</label>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">TIR estimada (%)</label>
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
                                    <label className="block text-xs font-bold text-gray-600 mb-1.5">Duração prevista (meses)</label>
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
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5">Custo sobe (%) <span className="font-normal text-gray-400">ex: 15</span></label>
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
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5">VGV cai (%) <span className="font-normal text-gray-400">ex: 10</span></label>
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
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5">Custo cai (%) <span className="font-normal text-gray-400">ex: 5</span></label>
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
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5">VGV sobe (%) <span className="font-normal text-gray-400">ex: 8</span></label>
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
                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Premissas e observações</label>
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
