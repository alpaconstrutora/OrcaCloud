import React, { useState, useMemo } from 'react';
import {
    UtensilsCrossed, Plus, Check, Settings,
    CalendarDays, Calculator, Loader2, AlertCircle,
    CheckCheck, X, Edit2, Save, FileText, Search, Wallet, Users, TrendingDown, TrendingUp,
} from 'lucide-react';
import ActionIconButton from './ui/ActionIconButton';
import { KpiCard } from './ui/KpiCard';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vrService, VrRegra, VrFeriado, VrCalculo } from '../services/vrService';
import { laborService, Employee } from '../services/laborService';
import { supabase } from '../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all';
const labelCls = 'text-xs font-semibold text-slate-500';

function mesLabel(iso: string) {
    const [y, m] = iso.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function primeiroDiaMes(year: number, month: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
const STATUS_CFG = {
    rascunho:  { label: 'Rascunho',  color: 'text-slate-600' },
    aprovado:  { label: 'Aprovado',  color: 'text-emerald-700' },
    pago:      { label: 'Pago',      color: 'text-blue-700' },
    cancelado: { label: 'Cancelado', color: 'text-rose-700' },
} as const;

function useToast() {
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };
    const Toast = () => notification ? (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            {notification.message}
        </div>
    ) : null;
    return { notify, Toast };
}

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
            <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-lg font-black text-slate-900">{regra?.id ? 'Editar regra' : 'Nova regra de VR'}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-[6px] transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {err && <div className="p-3 bg-rose-50 border border-rose-200 rounded-[6px] text-rose-700 text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{err}</div>}

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

                    <div className="bg-slate-50 rounded-[10px] p-4 space-y-3">
                        <p className={`${labelCls} mb-2`}>Dias que geram benefício</p>
                        <Toggle label="Sábados trabalhados" field="gera_sabado" />
                        <Toggle label="Domingos trabalhados" field="gera_domingo" />
                        <Toggle label="Feriados trabalhados" field="gera_feriado" />
                    </div>

                    <div className="bg-slate-50 rounded-[10px] p-4 space-y-3">
                        <p className={`${labelCls} mb-2`}>Desconta benefício em caso de</p>
                        <Toggle label="Faltas" field="desconta_falta" />
                        <Toggle label="Férias" field="desconta_ferias" />
                        <Toggle label="Afastamentos (INSS, licenças)" field="desconta_afastamento" />
                    </div>
                </div>
                <div className="p-6 border-t border-slate-100 flex gap-3 justify-end">
                    <button onClick={onClose} className="h-9 px-4 text-slate-600 font-medium text-sm rounded-[6px] hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white font-medium text-[13px] rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                        Salvar regra
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Aba Regras ───────────────────────────────────────────────────────────────

const AbaRegras: React.FC<{ orgId: string; projects: { id: string; name: string }[] }> = ({ orgId, projects }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
    const { data: regras = [], isLoading } = useQuery({
        queryKey: ['vr_regras', orgId],
        queryFn: () => vrService.listRegras(orgId),
    });
    const [modal, setModal] = useState<Partial<VrRegra> | null | false>(false);

    const del = useMutation({
        mutationFn: (id: string) => vrService.deleteRegra(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['vr_regras', orgId] }); notify('Regra excluída.'); },
        onError: () => notify('Erro ao excluir regra.', 'error'),
    });

    const handleDelete = async (r: VrRegra) => {
        const ok = await confirm({
            title: 'Excluir regra?',
            message: `A regra "${r.nome}" será removida permanentemente.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) del.mutate(r.id);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Regras de benefício</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Defina valor diário, tipo e critérios de elegibilidade por grupo</p>
                </div>
                <button
                    onClick={() => setModal({})}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95"
                >
                    <Plus className="w-[15px] h-[15px]" /> Nova regra
                </button>
            </div>

            {isLoading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : regras.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                    <UtensilsCrossed className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma regra cadastrada</h3>
                    <p className="text-sm text-gray-500">Crie uma regra para começar a calcular o vale refeição.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {regras.map(r => (
                        <div key={r.id} className="bg-white border border-slate-100 rounded-[10px] p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h4 className="text-sm font-black text-slate-900">{r.nome}</h4>
                                    <span className="text-xs font-medium text-orange-600">{r.tipo === 'refeicao' ? 'Refeição' : r.tipo === 'alimentacao' ? 'Alimentação' : 'Ambos'}</span>
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
                                {r.gera_sabado && <span className="text-xs bg-blue-50 text-blue-600 font-medium px-2 py-0.5 rounded-full">Sábado</span>}
                                {r.gera_feriado && <span className="text-xs bg-purple-50 text-purple-600 font-medium px-2 py-0.5 rounded-full">Feriado</span>}
                                {!r.desconta_falta && <span className="text-xs bg-amber-50 text-amber-600 font-medium px-2 py-0.5 rounded-full">Falta OK</span>}
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setModal(r)} className="flex-1 h-9 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-[6px] transition-colors flex items-center justify-center gap-1.5">
                                    <Edit2 className="w-3.5 h-3.5" /> Editar
                                </button>
                                <ActionIconButton kind="delete" onClick={() => handleDelete(r)} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {modal !== false && (
                <RegraModal
                    regra={modal}
                    orgId={orgId}
                    projects={projects}
                    onClose={() => setModal(false)}
                    onSaved={() => { setModal(false); qc.invalidateQueries({ queryKey: ['vr_regras', orgId] }); notify(modal && (modal as VrRegra).id ? 'Regra atualizada.' : 'Regra criada.'); }}
                />
            )}
            <Toast />
        </div>
    );
};

// ─── Aba Calendário (Feriados) ─────────────────────────────────────────────────

const AbaCalendario: React.FC<{ orgId: string; organizations: { id: string; name: string }[]; projects: { id: string; name: string }[] }> = ({ orgId, organizations, projects }) => {
    const qc = useQueryClient();
    const confirm = useConfirm();
    const { notify, Toast } = useToast();
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
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['vr_feriados', orgId, ano] }); notify('Feriado excluído.'); },
        onError: () => notify('Erro ao excluir feriado.', 'error'),
    });

    const handleDelete = async (f: VrFeriado) => {
        const ok = await confirm({
            title: 'Excluir feriado?',
            message: `"${f.descricao}" será removido do calendário.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (ok) del.mutate(f.id);
    };

    const handleAdd = async () => {
        if (!form.data || !form.descricao.trim()) return;
        setSaving(true);
        try {
            // Modo consolidado → insere em todas as orgs do usuário
            const orgsAlvo = (!orgId || orgId === 'all')
                ? organizations.map(o => o.id)
                : [orgId];

            for (const oid of orgsAlvo) {
                await vrService.upsertFeriado({
                    org_id: oid,
                    data: form.data,
                    descricao: form.descricao,
                    escopo: form.escopo,
                    project_id: form.project_id || null,
                });
            }
            setForm({ data: '', descricao: '', escopo: 'municipal', project_id: '' });
            qc.invalidateQueries({ queryKey: ['vr_feriados', orgId, ano] });
            notify('Feriado adicionado.');
        } catch (e: any) {
            notify('Erro ao adicionar feriado: ' + (e.message ?? e), 'error');
        } finally {
            setSaving(false);
        }
    };

    // Texto simples colorido — sem pílula/fundo/uppercase (guia §8).
    const escopoCfg = {
        nacional:  { label: 'Nacional',  color: 'text-blue-700' },
        estadual:  { label: 'Estadual',  color: 'text-purple-700' },
        municipal: { label: 'Municipal', color: 'text-teal-700' },
        obra:      { label: 'Obra',      color: 'text-orange-700' },
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Feriados e dias não úteis</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Cadastre feriados nacionais, estaduais, municipais ou específicos por obra</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1">
                    <button onClick={() => setAno(a => a - 1)} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 text-sm font-black text-slate-900">{ano}</span>
                    <button onClick={() => setAno(a => a + 1)} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
            </div>

            {/* Form add feriado */}
            <div className="bg-orange-50 border border-orange-100 rounded-[10px] p-4">
                <p className="text-xs font-semibold text-orange-700 mb-3">Adicionar feriado</p>
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
                    <button onClick={handleAdd} disabled={saving || !form.data || !form.descricao.trim()} className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-40">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
                        Adicionar
                    </button>
                </div>
            </div>

            {/* Lista agrupada por mês */}
            {isLoading ? (
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                </div>
            ) : feriados.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                    <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum feriado cadastrado para {ano}</h3>
                </div>
            ) : (
                <div className="space-y-3">
                    {MESES.map((mes, mi) => {
                        const doMes = feriados.filter(f => new Date(f.data + 'T12:00:00').getMonth() === mi);
                        if (doMes.length === 0) return null;
                        return (
                            <div key={mi} className="bg-white border border-slate-100 rounded-[10px] overflow-hidden">
                                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                                    <span className="text-xs font-semibold text-slate-600">{mes}/{ano}</span>
                                </div>
                                {doMes.map(f => {
                                    const ec = escopoCfg[f.escopo];
                                    return (
                                        <div key={f.id} className="flex items-center px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                            <div className="w-10 text-center">
                                                <span className="text-lg font-black text-slate-900">{new Date(f.data + 'T12:00:00').getDate()}</span>
                                            </div>
                                            <div className="flex-1 ml-4">
                                                <p className="text-sm font-normal text-slate-800">{f.descricao}</p>
                                                {f.project_id && <p className="text-xs text-slate-400">{projects.find(p => p.id === f.project_id)?.name}</p>}
                                            </div>
                                            <span className={`text-sm font-normal ${ec.color}`}>{ec.label}</span>
                                            <ActionIconButton kind="delete" className="ml-3" onClick={() => handleDelete(f)} />
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
            <Toast />
        </div>
    );
};

// ─── Aba Cálculo Mensal ───────────────────────────────────────────────────────

const CALCULO_COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'dias_uteis', label: 'Dias úteis', sortable: true },
    { key: 'faltas', label: 'Faltas', sortable: true },
    { key: 'ferias', label: 'Férias', sortable: true },
    { key: 'afastamento', label: 'Afastam.', sortable: true },
    { key: 'elegiveis', label: 'Elegíveis', sortable: true },
    { key: 'valor_dia', label: 'Valor/dia', sortable: true },
    { key: 'bruto', label: 'Bruto', sortable: true },
    { key: 'desconto', label: 'Desconto', sortable: true },
    { key: 'liquido', label: 'Líquido', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Ações', sortable: false },
];

const AbaCalculo: React.FC<{ orgId: string; employees: Employee[]; projects: { id: string; name: string }[] }> = ({ orgId, employees, projects }) => {
    const qc = useQueryClient();
    const { notify, Toast } = useToast();
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const mesIso = primeiroDiaMes(ano, mes);

    const [search, setSearch] = usePersistedState('vrCalculo:search', '');
    const [selectedRegra, setSelectedRegra] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editId, setEditId] = useState<string | null>(null);
    const [editMotivo, setEditMotivo] = useState('');
    const [editDias, setEditDias] = useState(0);
    const [gerandoAll, setGerandoAll] = useState(false);
    const tableColumns = useTableColumns(CALCULO_COLUMNS, 'vrCalculoColumns');

    const { data: regras = [] } = useQuery({ queryKey: ['vr_regras', orgId], queryFn: () => vrService.listRegras(orgId) });
    const { data: feriados = [] } = useQuery({ queryKey: ['vr_feriados', orgId, ano], queryFn: () => vrService.listFeriados(orgId, ano) });
    const { data: calculos = [], isLoading, refetch } = useQuery({
        queryKey: ['vr_calculos', orgId, mesIso],
        queryFn: () => vrService.listCalculos(orgId, mesIso),
    });

    const feriadosSet = useMemo(() => new Set(feriados.map(f => f.data)), [feriados]);
    const regra = useMemo(() => regras.find(r => r.id === selectedRegra), [regras, selectedRegra]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? calculos : calculos.filter(c => (c.employee_name || '').toLowerCase().includes(term) || (c.project_name || '').toLowerCase().includes(term));
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'project': return dir * (a.project_name || '').localeCompare(b.project_name || '');
                case 'dias_uteis': return dir * (a.dias_uteis - b.dias_uteis);
                case 'faltas': return dir * ((a.dias_faltas || 0) - (b.dias_faltas || 0));
                case 'ferias': return dir * ((a.dias_ferias || 0) - (b.dias_ferias || 0));
                case 'afastamento': return dir * ((a.dias_afastamento || 0) - (b.dias_afastamento || 0));
                case 'elegiveis': return dir * (a.dias_elegiveis - b.dias_elegiveis);
                case 'valor_dia': return dir * (a.valor_diario - b.valor_diario);
                case 'bruto': return dir * (a.valor_bruto - b.valor_bruto);
                case 'desconto': return dir * (a.desconto_folha - b.desconto_folha);
                case 'liquido': return dir * (a.valor_liquido - b.valor_liquido);
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [calculos, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    const toggleSel = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        const rascunhos = filtered.filter(c => c.status === 'rascunho').map(c => c.id);
        if (selectedIds.size === rascunhos.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(rascunhos));
    };

    const handleGerarTodos = async () => {
        if (!orgId || orgId === 'all') { notify('Selecione uma organização específica no topo do módulo antes de gerar o cálculo.', 'error'); return; }
        if (!regra) { notify('Selecione uma regra antes de gerar o cálculo.', 'error'); return; }
        const ativos = employees.filter(e => e.status === 'ATIVO');
        if (ativos.length === 0) { notify('Nenhum colaborador ativo.', 'error'); return; }

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
            notify('Cálculo gerado com sucesso.');
        } catch (e: any) {
            notify('Erro ao gerar: ' + e.message, 'error');
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
            notify('Selecionados aprovados.');
        } catch (e: any) {
            notify('Erro: ' + e.message, 'error');
        }
    };

    const handleAjuste = async () => {
        if (!editId || !editMotivo.trim()) return;
        try {
            await vrService.ajustarCalculo(editId, 'dias_elegiveis', editDias, editMotivo);
            setEditId(null);
            refetch();
            notify('Ajuste salvo.');
        } catch (e: any) {
            notify('Erro: ' + e.message, 'error');
        }
    };

    const rascunhos = filtered.filter(c => c.status === 'rascunho');
    const aprovadosOuPagos = calculos.filter(c => c.status === 'aprovado' || c.status === 'pago');
    const totalLiquido = aprovadosOuPagos.reduce((s, c) => s + c.valor_liquido, 0);
    const totalBruto = calculos.reduce((s, c) => s + c.valor_bruto, 0);
    const mediaDias = calculos.length ? (calculos.reduce((s, c) => s + c.dias_elegiveis, 0) / calculos.length) : 0;

    return (
        <div className="space-y-5">
            {/* Navegação de mês + geração */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1">
                    <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 text-sm font-black text-slate-900 min-w-[120px] text-center">{MESES[mes]}/{ano}</span>
                    <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
                <select className="h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-sm font-medium outline-none" value={selectedRegra} onChange={e => setSelectedRegra(e.target.value)}>
                    <option value="">Selecionar regra...</option>
                    {regras.map(r => <option key={r.id} value={r.id}>{r.nome} — R$ {r.valor_diario.toFixed(2)}/dia</option>)}
                </select>
                <select className="h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-sm font-medium outline-none" value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
                    <option value="">Todas as obras</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                    onClick={handleGerarTodos}
                    disabled={gerandoAll || !selectedRegra}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white text-[13px] font-medium rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-40 ml-auto"
                >
                    {gerandoAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-[15px] h-[15px]" />}
                    Gerar / recalcular
                </button>
            </div>

            {/* KPIs */}
            {calculos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Colaboradores" value={`${calculos.length}`} icon={<Users className="w-5 h-5" />} color="gray" />
                    <KpiCard label="Dias Elegíveis (Média)" value={mediaDias.toFixed(1)} icon={<CalendarDays className="w-5 h-5" />} color="orange" />
                    <KpiCard label="Total Bruto" value={`R$ ${totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Wallet className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Total Líquido (Aprovados)" value={`R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<CheckCheck className="w-5 h-5" />} color="emerald" />
                </div>
            )}

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar colaborador ou obra..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={CALCULO_COLUMNS.filter(c => c.key !== 'actions')}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum cálculo para {MESES[mes]}/{ano}</h3>
                        <p className="text-sm text-gray-500">Selecione uma regra e clique em "Gerar / recalcular".</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    <th className="w-10 px-4 py-2 border-r border-gray-100 text-center">
                                        <input type="checkbox" onChange={toggleAll} checked={rascunhos.length > 0 && selectedIds.size === rascunhos.length} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer" />
                                    </th>
                                    {tableColumns.visibleColumns.includes('employee') && (
                                        <SortableHeader label="Colaborador" colKey="employee" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('project') && (
                                        <SortableHeader label="Obra" colKey="project" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('dias_uteis') && (
                                        <SortableHeader label="Dias úteis" colKey="dias_uteis" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-center" />
                                    )}
                                    {tableColumns.visibleColumns.includes('faltas') && (
                                        <SortableHeader label="Faltas" colKey="faltas" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-center" />
                                    )}
                                    {tableColumns.visibleColumns.includes('ferias') && (
                                        <SortableHeader label="Férias" colKey="ferias" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-center" />
                                    )}
                                    {tableColumns.visibleColumns.includes('afastamento') && (
                                        <SortableHeader label="Afastam." colKey="afastamento" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-center" />
                                    )}
                                    {tableColumns.visibleColumns.includes('elegiveis') && (
                                        <SortableHeader label="Elegíveis" colKey="elegiveis" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-center" />
                                    )}
                                    {tableColumns.visibleColumns.includes('valor_dia') && (
                                        <SortableHeader label="Valor/dia" colKey="valor_dia" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('bruto') && (
                                        <SortableHeader label="Bruto" colKey="bruto" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('desconto') && (
                                        <SortableHeader label="Desconto" colKey="desconto" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('liquido') && (
                                        <SortableHeader label="Líquido" colKey="liquido" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader label="Status" colKey="status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('actions') && (
                                        <th className="px-3 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(c => {
                                    const st = STATUS_CFG[c.status];
                                    const isEdit = editId === c.id;
                                    return (
                                        <tr key={c.id} className="hover:bg-orange-50/40 transition-colors">
                                            <td className="px-4 py-2.5 border-r border-gray-100 text-center">
                                                {c.status === 'rascunho' && (
                                                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSel(c.id)} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 cursor-pointer" />
                                                )}
                                            </td>
                                            {tableColumns.visibleColumns.includes('employee') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 whitespace-nowrap">{c.employee_name}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('project') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-500 whitespace-nowrap">{c.project_name || '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('dias_uteis') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-gray-700">{c.dias_uteis}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('faltas') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-rose-600">{c.dias_faltas || '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('ferias') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-indigo-600">{c.dias_ferias || '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('afastamento') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-amber-600">{c.dias_afastamento || '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('elegiveis') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-center">
                                                    {isEdit ? (
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="w-16 px-2 py-1 border border-orange-300 rounded-[6px] text-center text-sm font-normal"
                                                            value={editDias}
                                                            onChange={e => setEditDias(parseInt(e.target.value) || 0)}
                                                        />
                                                    ) : (
                                                        <span className="text-sm font-normal text-emerald-700">{c.dias_elegiveis}</span>
                                                    )}
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('valor_dia') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-700 whitespace-nowrap">R$ {c.valor_diario.toFixed(2)}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('bruto') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800 whitespace-nowrap">R$ {c.valor_bruto.toFixed(2)}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('desconto') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-rose-600 whitespace-nowrap">{c.desconto_folha > 0 ? `- R$ ${c.desconto_folha.toFixed(2)}` : '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('liquido') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-emerald-700 whitespace-nowrap">R$ {c.valor_liquido.toFixed(2)}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal">
                                                    <span className={st.color}>{st.label}</span>
                                                </td>
                                            )}
                                            {tableColumns.visibleColumns.includes('actions') && (
                                                <td className="px-3 py-2.5 text-right">
                                                    {c.status === 'rascunho' && !isEdit && (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <ActionIconButton kind="edit" title="Ajustar dias elegíveis" onClick={() => { setEditId(c.id); setEditDias(c.dias_elegiveis); setEditMotivo(''); }} />
                                                            <ActionIconButton kind="edit" icon={<Check className="w-4 h-4" />} title="Aprovar" onClick={async () => { await vrService.aprovarLote([c.id]); refetch(); notify('Aprovado.'); }} />
                                                        </div>
                                                    )}
                                                    {isEdit && (
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <input
                                                                className="w-32 h-8 px-2 border border-gray-200 rounded-[6px] text-xs"
                                                                placeholder="Motivo do ajuste*"
                                                                value={editMotivo}
                                                                onChange={e => setEditMotivo(e.target.value)}
                                                            />
                                                            <button onClick={handleAjuste} disabled={!editMotivo.trim()} className="h-8 w-8 flex items-center justify-center bg-emerald-500 text-white rounded-[6px] disabled:opacity-40">
                                                                <Save className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => setEditId(null)} className="h-8 w-8 flex items-center justify-center bg-gray-100 text-gray-600 rounded-[6px]">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Barra de ações em lote (fixa, §10) */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-orange-600 text-white rounded-2xl shadow-lg shadow-orange-900/20">
                    <span className="text-sm font-bold whitespace-nowrap">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
                    <button onClick={handleAprovarLote} className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-orange-700 text-[13px] font-medium rounded-[6px] hover:bg-orange-50 transition-all active:scale-95">
                        <CheckCheck className="w-[15px] h-[15px]" /> Aprovar selecionados
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="h-9 px-3 text-sm font-medium text-white/80 hover:text-white">
                        Limpar
                    </button>
                </div>
            )}
            <Toast />
        </div>
    );
};

// ─── Aba Aprovados ────────────────────────────────────────────────────────────

const APROVADOS_COLUMNS: ColumnConfig[] = [
    { key: 'employee', label: 'Colaborador', sortable: true },
    { key: 'project', label: 'Obra', sortable: true },
    { key: 'elegiveis', label: 'Elegíveis', sortable: true },
    { key: 'valor_dia', label: 'Valor/dia', sortable: true },
    { key: 'bruto', label: 'Bruto', sortable: true },
    { key: 'desconto', label: 'Desconto', sortable: true },
    { key: 'liquido', label: 'Líquido', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
];

const AbaAprovados: React.FC<{ orgId: string }> = ({ orgId }) => {
    const hoje = new Date();
    const [ano, setAno] = useState(hoje.getFullYear());
    const [mes, setMes] = useState(hoje.getMonth());
    const mesIso = primeiroDiaMes(ano, mes);
    const [search, setSearch] = usePersistedState('vrAprovados:search', '');
    const tableColumns = useTableColumns(APROVADOS_COLUMNS, 'vrAprovadosColumns');

    const { data: calculos = [], isLoading } = useQuery({
        queryKey: ['vr_calculos', orgId, mesIso],
        queryFn: () => vrService.listCalculos(orgId, mesIso),
    });

    const aprovados = useMemo(
        () => calculos.filter(c => c.status === 'aprovado' || c.status === 'pago'),
        [calculos]
    );

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        const base = !term ? aprovados : aprovados.filter(c => (c.employee_name || '').toLowerCase().includes(term) || (c.project_name || '').toLowerCase().includes(term));
        if (!tableColumns.sortColumn) return base;
        const dir = tableColumns.sortDirection === 'asc' ? 1 : -1;
        return [...base].sort((a, b) => {
            switch (tableColumns.sortColumn) {
                case 'employee': return dir * (a.employee_name || '').localeCompare(b.employee_name || '');
                case 'project': return dir * (a.project_name || '').localeCompare(b.project_name || '');
                case 'elegiveis': return dir * (a.dias_elegiveis - b.dias_elegiveis);
                case 'valor_dia': return dir * (a.valor_diario - b.valor_diario);
                case 'bruto': return dir * (a.valor_bruto - b.valor_bruto);
                case 'desconto': return dir * (a.desconto_folha - b.desconto_folha);
                case 'liquido': return dir * (a.valor_liquido - b.valor_liquido);
                case 'status': return dir * a.status.localeCompare(b.status);
                default: return 0;
            }
        });
    }, [aprovados, search, tableColumns.sortColumn, tableColumns.sortDirection]);

    const totalLiquido = aprovados.reduce((s, c) => s + c.valor_liquido, 0);
    const totalBruto = aprovados.reduce((s, c) => s + c.valor_bruto, 0);
    const totalDesconto = aprovados.reduce((s, c) => s + c.desconto_folha, 0);

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Aprovados</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Relação de colaboradores com benefício aprovado e valor total do lote</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 rounded-[10px] p-1">
                    <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">‹</button>
                    <span className="px-3 text-sm font-black text-slate-900 min-w-[120px] text-center">{MESES[mes]}/{ano}</span>
                    <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }} className="h-8 px-3 rounded-[6px] text-sm font-medium text-slate-600 hover:bg-white transition-colors">›</button>
                </div>
            </div>

            {aprovados.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Colaboradores Aprovados" value={`${aprovados.length}`} icon={<Users className="w-5 h-5" />} color="gray" />
                    <KpiCard label="Total Bruto" value={`R$ ${totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<TrendingUp className="w-5 h-5" />} color="blue" />
                    <KpiCard label="Total Descontos" value={`R$ ${totalDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<TrendingDown className="w-5 h-5" />} color="rose" />
                    <KpiCard label="Total Líquido" value={`R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Wallet className="w-5 h-5" />} color="emerald" />
                </div>
            )}

            {/* Toolbar acoplada à tabela (§5.2) */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                        <div className="flex-1 relative w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar colaborador ou obra..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                            <ColumnConfigButton
                                columns={APROVADOS_COLUMNS}
                                visibleColumns={tableColumns.visibleColumns}
                                showColumnConfig={tableColumns.showColumnConfig}
                                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                                onToggleColumn={tableColumns.toggleColumn}
                                onReset={tableColumns.resetColumns}
                            />
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                        <p className="mt-2 text-gray-500">Carregando...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum benefício aprovado em {MESES[mes]}/{ano}</h3>
                        <p className="text-sm text-gray-500">Aprove os cálculos na aba "Cálculo Mensal" para vê-los aqui.</p>
                    </div>
                ) : (
                    <div className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                    {tableColumns.visibleColumns.includes('employee') && (
                                        <SortableHeader label="Colaborador" colKey="employee" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-4 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('project') && (
                                        <SortableHeader label="Obra" colKey="project" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100" />
                                    )}
                                    {tableColumns.visibleColumns.includes('elegiveis') && (
                                        <SortableHeader label="Elegíveis" colKey="elegiveis" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-center" />
                                    )}
                                    {tableColumns.visibleColumns.includes('valor_dia') && (
                                        <SortableHeader label="Valor/dia" colKey="valor_dia" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('bruto') && (
                                        <SortableHeader label="Bruto" colKey="bruto" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('desconto') && (
                                        <SortableHeader label="Desconto" colKey="desconto" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('liquido') && (
                                        <SortableHeader label="Líquido" colKey="liquido" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-3 py-2 border-r border-gray-100 text-right" />
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && (
                                        <SortableHeader label="Status" colKey="status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-4 py-2" />
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filtered.map(c => {
                                    const st = STATUS_CFG[c.status];
                                    return (
                                        <tr key={c.id} className="hover:bg-orange-50/40 transition-colors">
                                            {tableColumns.visibleColumns.includes('employee') && (
                                                <td className="px-4 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-900 whitespace-nowrap">{c.employee_name}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('project') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-sm font-normal text-gray-500 whitespace-nowrap">{c.project_name || '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('elegiveis') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-emerald-700">{c.dias_elegiveis}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('valor_dia') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-700 whitespace-nowrap">R$ {c.valor_diario.toFixed(2)}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('bruto') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-gray-800 whitespace-nowrap">R$ {c.valor_bruto.toFixed(2)}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('desconto') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-rose-600 whitespace-nowrap">{c.desconto_folha > 0 ? `- R$ ${c.desconto_folha.toFixed(2)}` : '—'}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('liquido') && (
                                                <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-medium text-emerald-700 whitespace-nowrap">R$ {c.valor_liquido.toFixed(2)}</td>
                                            )}
                                            {tableColumns.visibleColumns.includes('status') && (
                                                <td className="px-4 py-2.5 text-sm font-normal">
                                                    <span className={st.color}>{st.label}</span>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-gray-50 border-t-2 border-gray-200">
                                    <td colSpan={tableColumns.visibleColumns.filter(k => k !== 'liquido' && k !== 'status').length} className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Total do lote</td>
                                    {tableColumns.visibleColumns.includes('liquido') && (
                                        <td className="px-3 py-2.5 text-right text-sm font-semibold text-emerald-700 whitespace-nowrap">R$ {totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    )}
                                    {tableColumns.visibleColumns.includes('status') && <td></td>}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Aba Histórico ────────────────────────────────────────────────────────────

const AbaHistorico: React.FC<{ orgId: string }> = ({ orgId }) => {
    const [search, setSearch] = usePersistedState('vrHistorico:search', '');
    const { data: calculos = [], isLoading } = useQuery({
        queryKey: ['vr_calculos_hist', orgId],
        queryFn: () => vrService.listCalculos(orgId),
    });

    const filtrados = useMemo(() => {
        const term = search.trim().toLowerCase();
        return !term ? calculos : calculos.filter(c => (c.employee_name || '').toLowerCase().includes(term));
    }, [calculos, search]);

    const porMes = useMemo(() => {
        const map: Record<string, VrCalculo[]> = {};
        filtrados.forEach(c => {
            if (!map[c.mes_referencia]) map[c.mes_referencia] = [];
            map[c.mes_referencia].push(c);
        });
        return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
    }, [filtrados]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-black text-slate-900">Histórico de cálculos</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Todos os cálculos mensais registrados</p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar colaborador..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                    <p className="mt-2 text-gray-500">Carregando...</p>
                </div>
            ) : porMes.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum histórico encontrado</h3>
                </div>
            ) : (
                porMes.map(([mesIso, items]) => {
                    const total = items.reduce((s, c) => s + c.valor_liquido, 0);
                    const aprovados = items.filter(c => c.status === 'aprovado' || c.status === 'pago').length;
                    return (
                        <div key={mesIso} className="bg-white border border-slate-100 rounded-[10px] shadow-sm overflow-hidden">
                            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                                <span className="text-sm font-black text-slate-900 capitalize">{mesLabel(mesIso)}</span>
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="text-slate-500">{items.length} colaboradores</span>
                                    <span className="text-emerald-600 font-medium">{aprovados} aprovados</span>
                                    <span className="font-semibold text-slate-900">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {items.map(c => {
                                    const st = STATUS_CFG[c.status];
                                    return (
                                        <div key={c.id} className="flex items-center px-5 py-2.5 text-sm hover:bg-slate-50/50 transition-colors">
                                            <span className="flex-1 font-normal text-slate-800">{c.employee_name}</span>
                                            <span className="text-slate-400 text-xs mr-4">{c.dias_elegiveis} dias elegíveis</span>
                                            <span className="font-medium text-emerald-700 mr-4">R$ {c.valor_liquido.toFixed(2)}</span>
                                            <span className={`text-sm font-normal ${st.color}`}>{st.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

type VrTab = 'regras' | 'calendario' | 'calculo' | 'aprovados' | 'historico';

interface LaborValeRefeicaoProps {
    orgId: string;
    organizations: { id: string; name: string }[];
    employees: Employee[];
    projects: { id: string; name: string }[];
}

const TABS: { id: VrTab; label: string; icon: React.ElementType }[] = [
    { id: 'regras',     label: 'Regras',         icon: Settings },
    { id: 'calendario', label: 'Feriados',        icon: CalendarDays },
    { id: 'calculo',    label: 'Cálculo Mensal',  icon: Calculator },
    { id: 'aprovados',  label: 'Aprovados',       icon: CheckCheck },
    { id: 'historico',  label: 'Histórico',       icon: FileText },
];

const LaborValeRefeicao: React.FC<LaborValeRefeicaoProps> = ({ orgId, organizations, employees, projects }) => {
    const [tab, setTab] = usePersistedState<VrTab>('laborValeRefeicao:tab', 'calculo');

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela (§20) */}
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Vale Refeição / Alimentação</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">Cálculo automático mensal por dias elegíveis trabalhados.</p>
            </div>

            {/* Abas */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-[10px] w-fit overflow-x-auto">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 h-9 px-3.5 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${tab === t.id ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <t.icon className="w-4 h-4" />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === 'regras'     && <AbaRegras orgId={orgId} projects={projects} />}
            {tab === 'calendario' && <AbaCalendario orgId={orgId} organizations={organizations} projects={projects} />}
            {tab === 'calculo'    && <AbaCalculo orgId={orgId} employees={employees} projects={projects} />}
            {tab === 'aprovados'  && <AbaAprovados orgId={orgId} />}
            {tab === 'historico'  && <AbaHistorico orgId={orgId} />}
        </div>
    );
};

export default LaborValeRefeicao;
