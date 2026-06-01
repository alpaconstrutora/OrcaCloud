import React, { useState, useMemo } from 'react';
import {
    UtensilsCrossed, Plus, Trash2, Check, RefreshCw, Settings,
    CalendarDays, Calculator, ChevronDown, Loader2, AlertCircle,
    CheckCheck, X, Edit2, Save, Calendar, FileText
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vrService, VrRegra, VrFeriado, VrCalculo } from '../services/vrService';
import { laborService, Employee } from '../services/laborService';
import { supabase } from '../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all';
const labelCls = 'text-[10px] font-black text-slate-500 uppercase tracking-widest';

function mesLabel(iso: string) {
    const [y, m] = iso.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function primeiroDiaMes(year: number, month: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const STATUS_CFG = {
    rascunho:  { label: 'Rascunho',  color: 'text-slate-600',   bg: 'bg-slate-100' },
    aprovado:  { label: 'Aprovado',  color: 'text-emerald-700', bg: 'bg-emerald-100' },
    pago:      { label: 'Pago',      color: 'text-blue-700',    bg: 'bg-blue-100' },
    cancelado: { label: 'Cancelado', color: 'text-rose-700',    bg: 'bg-rose-100' },
} as const;

// ─── Modal de Regra ───────────────────────────────────────────────────────────

interface RegraModalProps {
    regra: Partial<VrRegra> | null;
    orgId: string;
    projects: { id: string; name: string }[];
    onClose: () => void;
    onSaved: () => void;
}

const RegraModal: React.FC<RegraModalProps> = ({ regra, orgId, projects, onClose, onSaved }) => {
    const [form, setForm] = useState<Partial<VrRegra>>({
        org_id: orgId,
        nome: '',
        tipo: 'refeicao',
        valor_diario: 30,
        desconto_folha_pct: 0,
        gera_sabado: false,
        gera_domingo: false,
        gera_feriado: false,
        desconta_falta: true,
        desconta_ferias: true,
        desconta_afastamento: true,
        ativo: true,
        ...regra,
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const set = (k: keyof VrRegra, v: any) => setForm(f => ({ ...f, [k]: v }));

    const handleSave = async () => {
        if (!orgId || orgId === 'all') { setErr('Selecione uma organização específica no topo do módulo antes de criar regras.'); return; }
        if (!form.nome?.trim()) { setErr('Nome é obrigatório'); return; }
        if (!form.valor_diario || form.valor_diario <= 0) { setErr('Valor diário deve ser positivo'); return; }
        setSaving(true);
        try {
            await vrService.upsertRegra({ ...form, org_id: orgId } as any);
            onSaved();
        } catch (e: any) {
            setErr(e.message ?? 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const Toggle: React.FC<{ label: string; field: keyof VrRegra }> = ({ label, field }) => (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
                type="button"
                onClick={() => set(field, !form[field])}
                className={`relative w-10 h-5 rounded-full transition-colors ${form[field] ? 'bg-orange-500' : 'bg-slate-200'}`}
            >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[field] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-slate-700 font-medium">{label}</span>
        </label>
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-900">{regra?.id ? 'Editar Regra' : 'Nova Regra de VR'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {err && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{err}</div>}

                    <div className="space-y-1.5">
                        <label className={labelCls}>Nome da regra</label>
                        <input className={inputCls} value={form.nome ?? ''} onChange={e => set('nome', e.target.value)} placeholder="Ex: Pedreiros — Obra A" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Tipo</label>
                            <select className={inputCls} value={form.tipo} onChange={e => set('tipo', e.target.value as any)}>
                                <option value="refeicao">Refeição</option>
                                <option value="alimentacao">Alimentação</option>
                                <option value="ambos">Ambos</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Obra (opcional)</label>
                            <select className={inputCls} value={form.project_id ?? ''} onChange={e => set('project_id', e.target.value || null)}>
                                <option value="">Todas as obras</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={labelCls}>Valor diário (R$)</label>
                            <input
                                className={inputCls}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.valor_diario ?? ''}
                                onChange={e => set('valor_diario', parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelCls}>Desconto em folha (%)</label>
                            <input
                                className={inputCls}
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.desconto_folha_pct ?? 0}
                                onChange={e => set('desconto_folha_pct', parseFloat(e.target.value) || 0)}
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                        <p className={`${labelCls} mb-2`}>Dias que geram benefício</p>
                        <Toggle label="Sábados trabalhados" field="gera_sabado" />
                        <Toggle label="Domingos trabalhados" field="gera_domingo" />
                        <Toggle label="Feriados trabalhados" field="gera_feriado" />
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                        <p className={`${labelCls} mb-2`}>Desconta benefício em caso de</p>
                        <Toggle label="Faltas" field="desconta_falta" />
                        <Toggle label="Férias" field="desconta_ferias" />
                        <Toggle label="Afastamentos (INSS, licenças)" field="desconta_afastamento" />
                    </div>
                </div>
                <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-orange-500 text-white font-bold text-sm rounded-xl hover:bg-orange-600 transition-colors flex items-center gap-2 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar Regra
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Aba Regras ───────────────────────────────────────────────────────────────

const AbaRegras: React.FC<{ orgId: string; projects: { id: string; name: string }[] }> = ({ orgId, projects }) => {
    const qc = useQueryClient();
    const { data: regras = [], isLoading } = useQuery({
        queryKey: ['vr_regras', orgId],
        queryFn: () => vrService.listRegras(orgId),
    });
    const [modal, setModal] = useState<Partial<VrRegra> | null | false>(false);

    const del = useMutation({
        mutationFn: (id: string) => vrService.deleteRegra(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['vr_regras', orgId] }),
    });

    if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Regras de Benefício</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Defina valor diário, tipo e critérios de elegibilidade por grupo</p>
                </div>
                <button
                    onClick={() => setModal({})}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
                >
                    <Plus className="w-4 h-4" /> Nova Regra
                </button>
            </div>

            {regras.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                    <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-sm">Nenhuma regra cadastrada</p>
                    <p className="text-xs mt-1">Crie uma regra para começar a calcular o vale refeição</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {regras.map(r => (
                    <div key={r.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h4 className="text-sm font-black text-slate-900">{r.nome}</h4>
                                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full capitalize">{r.tipo === 'refeicao' ? 'Refeição' : r.tipo === 'alimentacao' ? 'Alimentação' : 'Ambos'}</span>
                            </div>
                            <div className={`w-2.5 h-2.5 rounded-full mt-1 ${r.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`} title={r.ativo ? 'Ativa' : 'Inativa'} />
                        </div>

                        <div className="text-3xl font-black text-slate-900 mb-1">
                            R$ {r.valor_diario.toFixed(2).replace('.', ',')}
                            <span className="text-xs font-medium text-slate-400 ml-1">/ dia</span>
                        </div>
                        {r.desconto_folha_pct > 0 && (
                            <p className="text-xs text-slate-500 mb-3">{r.desconto_folha_pct}% desconto em folha</p>
                        )}

                        <div className="flex flex-wrap gap-1 mb-4">
                            {r.gera_sabado && <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">Sábado</span>}
                            {r.gera_feriado && <span className="text-[10px] bg-purple-50 text-purple-600 font-bold px-2 py-0.5 rounded-full">Feriado</span>}
                            {!r.desconta_falta && <span className="text-[10px] bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-full">Falta OK</span>}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setModal(r)} className="flex-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors flex items-center justify-center gap-1.5">
                                <Edit2 className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button
                                onClick={() => { if (confirm('Excluir esta regra?')) del.mutate(r.id); }}
                                className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {modal !== false && (
                <RegraModal
                    regra={modal}
                    orgId={orgId}
                    projects={projects}
                    onClose={() => setModal(false)}
                    onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ['vr_regras', orgId] }); }}
                />
            )}
        </div>
    );
};

// ─── Aba Calendário ───────────────────────────────────────────────────────────

const AbaCalendario: React.FC<{ orgId: string; projects: { id: string; name: string }[] }> = ({ orgId, projects }) => {
    const qc = useQueryClient();
    const anoAtual = new Date().getFullYear();
    const [ano, setAno] = useState(anoAtual);

    const { data: feriados = [], isLoading } = useQuery({
        queryKey: ['vr_feriados', orgId, ano],
        queryFn: () => vrService.listFeriados(orgId, ano),
    });

    const [form, setForm] = useState({ data: '', descricao: '', escopo: 'municipal' as VrFeriado['escopo'], project_id: '' });
    const [saving, setSaving] = useState(false);

    const del = useMutation({
        mutationFn: (id: string) => vrService.deleteFeriado(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['vr_feriados', orgId, ano] }),
    });

    const handleAdd = async () => {
        if (!orgId || orgId === 'all') { alert('Selecione uma organização específica no topo do módulo antes de cadastrar feriados.'); return; }
        if (!form.data || !form.descricao.trim()) return;
        setSaving(true);
        try {
            await vrService.upsertFeriado({
                org_id: orgId,
                data: form.data,
                descricao: form.descricao,
                escopo: form.escopo,
                project_id: form.project_id || null,
            });
            setForm({ data: '', descricao: '', escopo: 'municipal', project_id: '' });
            qc.invalidateQueries({ queryKey: ['vr_feriados', orgId, ano] });
        } finally {
            setSaving(false);
        }
    };

    const escopoCfg = {
        nacional:  { label: 'Nacional',  color: 'text-blue-700',   bg: 'bg-blue-50' },
        estadual:  { label: 'Estadual',  color: 'text-purple-700', bg: 'bg-purple-50' },
        municipal: { label: 'Municipal', color: 'text-teal-700',   bg: 'bg-teal-50' },
        obra:      { label: 'Obra',      color: 'text-orange-700', bg: 'bg-orange-50' },
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Feriados e Dias Não Úteis</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Cadastre feriados nacionais, estaduais, municipais ou específicos por obra</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    <button onClick={() => setAno(a => a - 1)} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 py-1.5 text-sm font-black text-slate-900">{ano}</span>
                    <button onClick={() => setAno(a => a + 1)} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
            </div>

            {/* Form add feriado */}
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
                <p className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-3">Adicionar Feriado</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <label className={labelCls}>Data</label>
                        <input type="date" className={inputCls} value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="space-y-1 md:col-span-1">
                        <label className={labelCls}>Descrição</label>
                        <input className={inputCls} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Corpus Christi" />
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls}>Escopo</label>
                        <select className={inputCls} value={form.escopo} onChange={e => setForm(f => ({ ...f, escopo: e.target.value as any }))}>
                            <option value="nacional">Nacional</option>
                            <option value="estadual">Estadual</option>
                            <option value="municipal">Municipal</option>
                            <option value="obra">Obra específica</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className={labelCls}>Obra (opcional)</label>
                        <select className={inputCls} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                            <option value="">Todas</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end mt-3">
                    <button onClick={handleAdd} disabled={saving || !form.data || !form.descricao.trim()} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-40">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Lista agrupada por mês */}
            {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
            ) : feriados.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold">Nenhum feriado cadastrado para {ano}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {MESES.map((mes, mi) => {
                        const doMes = feriados.filter(f => new Date(f.data + 'T12:00:00').getMonth() === mi);
                        if (doMes.length === 0) return null;
                        return (
                            <div key={mi} className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{mes}/{ano}</span>
                                </div>
                                {doMes.map(f => {
                                    const ec = escopoCfg[f.escopo];
                                    return (
                                        <div key={f.id} className="flex items-center px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                            <div className="w-10 text-center">
                                                <span className="text-lg font-black text-slate-900">{new Date(f.data + 'T12:00:00').getDate()}</span>
                                            </div>
                                            <div className="flex-1 ml-4">
                                                <p className="text-sm font-bold text-slate-800">{f.descricao}</p>
                                                {f.project_id && <p className="text-xs text-slate-400">{projects.find(p => p.id === f.project_id)?.name}</p>}
                                            </div>
                                            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${ec.bg} ${ec.color}`}>{ec.label}</span>
                                            <button onClick={() => del.mutate(f.id)} className="ml-3 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Aba Cálculo Mensal ───────────────────────────────────────────────────────

const AbaCalculo: React.FC<{ orgId: string; employees: Employee[]; projects: { id: string; name: string }[] }> = ({ orgId, employees, projects }) => {
    const qc = useQueryClient();
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const mesIso = primeiroDiaMes(ano, mes);

    const [selectedRegra, setSelectedRegra] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editId, setEditId] = useState<string | null>(null);
    const [editMotivo, setEditMotivo] = useState('');
    const [editDias, setEditDias] = useState(0);
    const [gerandoAll, setGerandoAll] = useState(false);

    const { data: regras = [] } = useQuery({ queryKey: ['vr_regras', orgId], queryFn: () => vrService.listRegras(orgId) });
    const { data: feriados = [] } = useQuery({ queryKey: ['vr_feriados', orgId, ano], queryFn: () => vrService.listFeriados(orgId, ano) });
    const { data: calculos = [], isLoading, refetch } = useQuery({
        queryKey: ['vr_calculos', orgId, mesIso],
        queryFn: () => vrService.listCalculos(orgId, mesIso),
    });

    const feriadosSet = useMemo(() => new Set(feriados.map(f => f.data)), [feriados]);

    const regra = useMemo(() => regras.find(r => r.id === selectedRegra), [regras, selectedRegra]);

    const toggleSel = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        const rascunhos = calculos.filter(c => c.status === 'rascunho').map(c => c.id);
        if (selectedIds.size === rascunhos.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(rascunhos));
    };

    const handleGerarTodos = async () => {
        if (!orgId || orgId === 'all') { alert('Selecione uma organização específica no topo do módulo antes de gerar o cálculo.'); return; }
        if (!regra) { alert('Selecione uma regra antes de gerar o cálculo'); return; }
        const ativos = employees.filter(e => e.status === 'ATIVO');
        if (ativos.length === 0) { alert('Nenhum colaborador ativo'); return; }

        setGerandoAll(true);
        try {
            // Busca ausências do mês para todos os funcionários
            const { data: ausencias } = await supabase
                .from('absences')
                .select('employee_id,tipo,data_inicio,data_fim,status')
                .eq('org_id', orgId)
                .gte('data_fim', mesIso)
                .lte('data_inicio', `${ano}-${String(mes + 1).padStart(2, '0')}-${new Date(ano, mes + 1, 0).getDate()}`);

            const ausMap: Record<string, any[]> = {};
            (ausencias ?? []).forEach((a: any) => {
                if (!ausMap[a.employee_id]) ausMap[a.employee_id] = [];
                ausMap[a.employee_id].push(a);
            });

            for (const emp of ativos) {
                await vrService.gerarCalculoMensal({
                    orgId,
                    regraId: regra.id,
                    employeeId: emp.id,
                    projectId: selectedProject || null,
                    mesReferencia: new Date(ano, mes, 1),
                    feriados: Array.from(feriadosSet),
                    ausencias: ausMap[emp.id] ?? [],
                    admissao: (emp as any).hire_date || undefined,
                    desligamento: (emp as any).termination_date || undefined,
                });
            }
            await refetch();
        } catch (e: any) {
            alert('Erro ao gerar: ' + e.message);
        } finally {
            setGerandoAll(false);
        }
    };

    const handleAprovarLote = async () => {
        if (selectedIds.size === 0) return;
        try {
            await vrService.aprovarLote(Array.from(selectedIds));
            setSelectedIds(new Set());
            refetch();
        } catch (e: any) {
            alert('Erro: ' + e.message);
        }
    };

    const handleAjuste = async () => {
        if (!editId || !editMotivo.trim()) return;
        try {
            await vrService.ajustarCalculo(editId, 'dias_elegiveis', editDias, editMotivo);
            setEditId(null);
            refetch();
        } catch (e: any) {
            alert('Erro: ' + e.message);
        }
    };

    const rascunhos = calculos.filter(c => c.status === 'rascunho');
    const totalLiquido = calculos.reduce((s, c) => s + c.valor_liquido, 0);

    return (
        <div className="space-y-5">
            {/* Controles */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 py-1.5 text-sm font-black text-slate-900 min-w-[120px] text-center">{MESES[mes]}/{ano}</span>
                    <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }} className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
                <select className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none" value={selectedRegra} onChange={e => setSelectedRegra(e.target.value)}>
                    <option value="">Selecionar regra...</option>
                    {regras.map(r => <option key={r.id} value={r.id}>{r.nome} — R$ {r.valor_diario.toFixed(2)}/dia</option>)}
                </select>
                <select className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                    <option value="">Todas as obras</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                    onClick={handleGerarTodos}
                    disabled={gerandoAll || !selectedRegra}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-40 shadow-lg shadow-orange-500/20 ml-auto"
                >
                    {gerandoAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    Gerar / Recalcular
                </button>
            </div>

            {/* KPIs */}
            {calculos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Colaboradores', value: calculos.length.toString(), color: 'text-slate-700' },
                        { label: 'Dias elegíveis (média)', value: calculos.length ? (calculos.reduce((s, c) => s + c.dias_elegiveis, 0) / calculos.length).toFixed(1) : '—', color: 'text-orange-700' },
                        { label: 'Total bruto', value: `R$ ${calculos.reduce((s, c) => s + c.valor_bruto, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-blue-700' },
                        { label: 'Total líquido', value: `R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-emerald-700' },
                    ].map(k => (
                        <div key={k.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{k.label}</p>
                            <p className={`text-xl font-black mt-1 ${k.color}`}>{k.value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Ações em lote */}
            {selectedIds.size > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 flex items-center gap-3">
                    <span className="text-sm font-bold text-orange-800">{selectedIds.size} selecionado(s)</span>
                    <button onClick={handleAprovarLote} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors">
                        <CheckCheck className="w-3.5 h-3.5" /> Aprovar selecionados
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-xs font-bold text-orange-600 hover:text-orange-800 ml-auto">Limpar</button>
                </div>
            )}

            {/* Tabela */}
            {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
            ) : calculos.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <Calculator className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-sm">Nenhum cálculo para {MESES[mes]}/{ano}</p>
                    <p className="text-xs mt-1">Selecione uma regra e clique em "Gerar / Recalcular"</p>
                </div>
            ) : (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="pl-4 pr-2 py-3 text-left">
                                        <input type="checkbox" onChange={toggleAll} checked={rascunhos.length > 0 && selectedIds.size === rascunhos.length} className="rounded" />
                                    </th>
                                    {['Colaborador','Obra','Dias Úteis','Faltas','Férias','Afastan.','Elegíveis','Valor/Dia','Bruto','Desconto','Líquido','Status',''].map(h => (
                                        <th key={h} className="px-3 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {calculos.map(c => {
                                    const st = STATUS_CFG[c.status];
                                    const isEdit = editId === c.id;
                                    return (
                                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="pl-4 pr-2 py-3">
                                                {c.status === 'rascunho' && (
                                                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} className="rounded" />
                                                )}
                                            </td>
                                            <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">{c.employee_name}</td>
                                            <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">{c.project_name || '—'}</td>
                                            <td className="px-3 py-3 text-center font-bold text-slate-700">{c.dias_uteis}</td>
                                            <td className="px-3 py-3 text-center font-bold text-rose-600">{c.dias_faltas || '—'}</td>
                                            <td className="px-3 py-3 text-center font-bold text-indigo-600">{c.dias_ferias || '—'}</td>
                                            <td className="px-3 py-3 text-center font-bold text-amber-600">{c.dias_afastamento || '—'}</td>
                                            <td className="px-3 py-3 text-center">
                                                {isEdit ? (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-16 px-2 py-1 border border-orange-300 rounded-lg text-center text-sm font-bold"
                                                        value={editDias}
                                                        onChange={e => setEditDias(parseInt(e.target.value) || 0)}
                                                    />
                                                ) : (
                                                    <span className="font-black text-emerald-700">{c.dias_elegiveis}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-right font-bold text-slate-600 whitespace-nowrap">R$ {c.valor_diario.toFixed(2)}</td>
                                            <td className="px-3 py-3 text-right font-bold text-slate-700 whitespace-nowrap">R$ {c.valor_bruto.toFixed(2)}</td>
                                            <td className="px-3 py-3 text-right text-rose-600 font-bold whitespace-nowrap">{c.desconto_folha > 0 ? `- R$ ${c.desconto_folha.toFixed(2)}` : '—'}</td>
                                            <td className="px-3 py-3 text-right font-black text-emerald-700 whitespace-nowrap">R$ {c.valor_liquido.toFixed(2)}</td>
                                            <td className="px-3 py-3">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-full whitespace-nowrap ${st.bg} ${st.color}`}>{st.label}</span>
                                            </td>
                                            <td className="px-3 py-3">
                                                {c.status === 'rascunho' && !isEdit && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => { setEditId(c.id); setEditDias(c.dias_elegiveis); setEditMotivo(''); }}
                                                            className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                                                            title="Ajustar dias elegíveis"
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={async () => { await vrService.aprovarLote([c.id]); refetch(); }}
                                                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                            title="Aprovar"
                                                        >
                                                            <Check className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                                {isEdit && (
                                                    <div className="space-y-1">
                                                        <input
                                                            className="w-36 px-2 py-1 border border-slate-200 rounded-lg text-xs"
                                                            placeholder="Motivo do ajuste*"
                                                            value={editMotivo}
                                                            onChange={e => setEditMotivo(e.target.value)}
                                                        />
                                                        <div className="flex gap-1">
                                                            <button onClick={handleAjuste} disabled={!editMotivo.trim()} className="flex-1 px-2 py-1 bg-emerald-500 text-white text-xs font-bold rounded-lg disabled:opacity-40">
                                                                <Save className="w-3 h-3 mx-auto" />
                                                            </button>
                                                            <button onClick={() => setEditId(null)} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg">
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Aba Histórico ────────────────────────────────────────────────────────────

const AbaHistorico: React.FC<{ orgId: string }> = ({ orgId }) => {
    const { data: calculos = [], isLoading } = useQuery({
        queryKey: ['vr_calculos_hist', orgId],
        queryFn: () => vrService.listCalculos(orgId),
    });

    const porMes = useMemo(() => {
        const map: Record<string, VrCalculo[]> = {};
        calculos.forEach(c => {
            if (!map[c.mes_referencia]) map[c.mes_referencia] = [];
            map[c.mes_referencia].push(c);
        });
        return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
    }, [calculos]);

    if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">Histórico de Cálculos</h3>
                <p className="text-xs text-slate-500 mt-0.5">Todos os cálculos mensais registrados</p>
            </div>

            {porMes.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold">Nenhum histórico encontrado</p>
                </div>
            )}

            {porMes.map(([mesIso, items]) => {
                const total = items.reduce((s, c) => s + c.valor_liquido, 0);
                const aprovados = items.filter(c => c.status === 'aprovado' || c.status === 'pago').length;
                return (
                    <div key={mesIso} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-sm font-black text-slate-900">{mesLabel(mesIso)}</span>
                            <div className="flex items-center gap-4 text-xs">
                                <span className="text-slate-500">{items.length} colaboradores</span>
                                <span className="text-emerald-600 font-bold">{aprovados} aprovados</span>
                                <span className="font-black text-slate-900">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {items.map(c => {
                                const st = STATUS_CFG[c.status];
                                return (
                                    <div key={c.id} className="flex items-center px-5 py-3 text-sm hover:bg-slate-50/50 transition-colors">
                                        <span className="flex-1 font-bold text-slate-800">{c.employee_name}</span>
                                        <span className="text-slate-400 text-xs mr-4">{c.dias_elegiveis} dias elegíveis</span>
                                        <span className="font-black text-emerald-700 mr-4">R$ {c.valor_liquido.toFixed(2)}</span>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

type VrTab = 'regras' | 'calendario' | 'calculo' | 'historico';

interface LaborValeRefeicaoProps {
    orgId: string;
    employees: Employee[];
    projects: { id: string; name: string }[];
}

const TABS: { id: VrTab; label: string; icon: React.ElementType }[] = [
    { id: 'regras',     label: 'Regras',         icon: Settings },
    { id: 'calendario', label: 'Feriados',        icon: CalendarDays },
    { id: 'calculo',    label: 'Cálculo Mensal',  icon: Calculator },
    { id: 'historico',  label: 'Histórico',       icon: FileText },
];

const LaborValeRefeicao: React.FC<LaborValeRefeicaoProps> = ({ orgId, employees, projects }) => {
    const [tab, setTab] = useState<VrTab>('calculo');

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-orange-500 rounded-xl shadow-lg shadow-orange-500/30">
                    <UtensilsCrossed className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Vale Refeição / Alimentação</h2>
                    <p className="text-xs text-slate-400 font-medium">Cálculo automático por dias elegíveis trabalhados</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${tab === t.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === 'regras'     && <AbaRegras orgId={orgId} projects={projects} />}
            {tab === 'calendario' && <AbaCalendario orgId={orgId} projects={projects} />}
            {tab === 'calculo'    && <AbaCalculo orgId={orgId} employees={employees} projects={projects} />}
            {tab === 'historico'  && <AbaHistorico orgId={orgId} />}
        </div>
    );
};

export default LaborValeRefeicao;
