import React, { useState, useEffect, useCallback } from 'react';
import {
    Target, Plus, Edit2, Trash2, Save, X,
    AlertCircle, Loader2, TrendingUp,
} from 'lucide-react';
import { CompanyTarget, CompanyTargetUpsert } from '../types';
import { companyService } from '../services/companyService';

interface Props {
    companyId: string;
}

type FormData = {
    ano: string;
    faturamento_meta: string;
    margem_alvo_pct: string;
    ebitda_alvo: string;
    ticket_medio_alvo: string;
    qtd_obras_meta: string;
    limite_endividamento_pct: string;
};

const EMPTY: FormData = {
    ano: String(new Date().getFullYear()),
    faturamento_meta: '', margem_alvo_pct: '', ebitda_alvo: '',
    ticket_medio_alvo: '', qtd_obras_meta: '', limite_endividamento_pct: '',
};

const cls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">{label}</label>
        {children}
    </div>
);

const brl = (v?: number | null) =>
    v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—';

const pct = (v?: number | null) => v != null ? `${v.toFixed(1)}%` : '—';

const CompanyTargetsTab: React.FC<Props> = ({ companyId }) => {
    const [targets, setTargets] = useState<CompanyTarget[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormData>(EMPTY);

    const load = useCallback(async () => {
        setLoading(true);
        try { setTargets(await companyService.listTargets(companyId)); }
        catch (e: unknown) { setError((e as Error).message); }
        finally { setLoading(false); }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setEditingId(null); setForm(EMPTY); setShowForm(true); setError(null); };
    const openEdit = (t: CompanyTarget) => {
        setEditingId(t.id);
        setForm({
            ano: String(t.ano),
            faturamento_meta: t.faturamento_meta != null ? String(t.faturamento_meta) : '',
            margem_alvo_pct: t.margem_alvo_pct != null ? String(t.margem_alvo_pct) : '',
            ebitda_alvo: t.ebitda_alvo != null ? String(t.ebitda_alvo) : '',
            ticket_medio_alvo: t.ticket_medio_alvo != null ? String(t.ticket_medio_alvo) : '',
            qtd_obras_meta: t.qtd_obras_meta != null ? String(t.qtd_obras_meta) : '',
            limite_endividamento_pct: t.limite_endividamento_pct != null ? String(t.limite_endividamento_pct) : '',
        });
        setShowForm(true); setError(null);
    };
    const cancel = () => { setShowForm(false); setEditingId(null); setError(null); };
    const set = (f: keyof FormData, v: string) => setForm(prev => ({ ...prev, [f]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const ano = parseInt(form.ano);
        if (!ano || ano < 2000 || ano > 2100) { setError('Ano inválido.'); return; }
        setSaving(true); setError(null);
        try {
            const payload: CompanyTargetUpsert = {
                company_id: companyId,
                ano,
                faturamento_meta: form.faturamento_meta ? parseFloat(form.faturamento_meta) : undefined,
                margem_alvo_pct: form.margem_alvo_pct ? parseFloat(form.margem_alvo_pct) : undefined,
                ebitda_alvo: form.ebitda_alvo ? parseFloat(form.ebitda_alvo) : undefined,
                ticket_medio_alvo: form.ticket_medio_alvo ? parseFloat(form.ticket_medio_alvo) : undefined,
                qtd_obras_meta: form.qtd_obras_meta ? parseInt(form.qtd_obras_meta) : undefined,
                limite_endividamento_pct: form.limite_endividamento_pct ? parseFloat(form.limite_endividamento_pct) : undefined,
            };
            await companyService.upsertTarget(payload);
            await load(); cancel();
        } catch (e: unknown) { setError((e as Error).message); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: string, ano: number) => {
        if (!confirm(`Excluir metas de ${ano}?`)) return;
        try { await companyService.removeTarget(id); setTargets(prev => prev.filter(t => t.id !== id)); }
        catch (e: unknown) { setError((e as Error).message); }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Metas e Indicadores Anuais</p>
                {!showForm && (
                    <button onClick={openNew}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" /> Definir Metas
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}

            {showForm && (
                <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-600">
                            {editingId ? 'Editar Metas' : 'Novas Metas'}
                        </p>
                        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        <Field label="Ano">
                            <input type="number" min="2020" max="2050" className={cls}
                                value={form.ano} onChange={e => set('ano', e.target.value)} />
                        </Field>
                        <Field label="Faturamento Meta (R$)">
                            <input type="number" min="0" step="1000" className={cls}
                                placeholder="ex: 5000000"
                                value={form.faturamento_meta} onChange={e => set('faturamento_meta', e.target.value)} />
                        </Field>
                        <Field label="Margem Alvo (%)">
                            <input type="number" min="0" max="100" step="0.1" className={cls}
                                placeholder="ex: 18.5"
                                value={form.margem_alvo_pct} onChange={e => set('margem_alvo_pct', e.target.value)} />
                        </Field>
                        <Field label="EBITDA Alvo (R$)">
                            <input type="number" min="0" step="1000" className={cls}
                                value={form.ebitda_alvo} onChange={e => set('ebitda_alvo', e.target.value)} />
                        </Field>
                        <Field label="Ticket Médio Alvo (R$)">
                            <input type="number" min="0" step="1000" className={cls}
                                value={form.ticket_medio_alvo} onChange={e => set('ticket_medio_alvo', e.target.value)} />
                        </Field>
                        <Field label="Obras Meta (qtd)">
                            <input type="number" min="0" step="1" className={cls}
                                value={form.qtd_obras_meta} onChange={e => set('qtd_obras_meta', e.target.value)} />
                        </Field>
                        <Field label="Limite Endividamento (%)">
                            <input type="number" min="0" max="200" step="0.1" className={cls}
                                placeholder="ex: 60.0"
                                value={form.limite_endividamento_pct} onChange={e => set('limite_endividamento_pct', e.target.value)} />
                        </Field>
                    </div>

                    <div className="flex justify-end gap-2 pt-1 border-t border-gray-200">
                        <button type="button" onClick={cancel}
                            className="px-4 py-2 text-xs font-black uppercase tracking-wide text-gray-500 hover:text-gray-700">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Salvar
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : targets.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                    <Target className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma meta definida.</p>
                    <p className="text-xs">Clique em "Definir Metas" para configurar os indicadores anuais.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {targets.map(t => (
                        <div key={t.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                                        <TrendingUp className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-900">{t.ano}</p>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Metas</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => openEdit(t)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDelete(t.id, t.ano)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {[
                                    { label: 'Faturamento', value: brl(t.faturamento_meta) },
                                    { label: 'Margem Alvo', value: pct(t.margem_alvo_pct) },
                                    { label: 'EBITDA', value: brl(t.ebitda_alvo) },
                                    { label: 'Ticket Médio', value: brl(t.ticket_medio_alvo) },
                                    { label: 'Obras (meta)', value: t.qtd_obras_meta != null ? String(t.qtd_obras_meta) : '—' },
                                    { label: 'Lim. Endividamento', value: pct(t.limite_endividamento_pct) },
                                ].map(kpi => (
                                    <div key={kpi.label} className="bg-gray-50 rounded-xl p-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{kpi.label}</p>
                                        <p className="text-sm font-black text-gray-900">{kpi.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompanyTargetsTab;
