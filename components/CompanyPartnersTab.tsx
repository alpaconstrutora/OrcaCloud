import React, { useState, useEffect, useCallback } from 'react';
import {
    Users, Plus, Edit2, Trash2, Save, X,
    AlertCircle, Loader2, Crown, PenLine,
} from 'lucide-react';
import {
    Company, CompanyPartner, CompanyPartnerInsert,
} from '../types';
import { companyService } from '../services/companyService';

interface Props {
    companyId: string;
    companies: Company[];
}

type FormData = {
    tipo_pessoa: 'pf' | 'pj';
    nome: string;
    documento: string;
    participacao_pct: string;
    is_administrador: boolean;
    is_assinante_legal: boolean;
    pj_company_id: string;
    data_entrada: string;
    data_saida: string;
};

const EMPTY: FormData = {
    tipo_pessoa: 'pf', nome: '', documento: '', participacao_pct: '',
    is_administrador: false, is_assinante_legal: false,
    pj_company_id: '', data_entrada: '', data_saida: '',
};

const cls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">
            {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {children}
    </div>
);

const CompanyPartnersTab: React.FC<Props> = ({ companyId, companies }) => {
    const [partners, setPartners] = useState<CompanyPartner[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormData>(EMPTY);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setPartners(await companyService.listPartners(companyId));
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setEditingId(null); setForm(EMPTY); setShowForm(true); setError(null); };

    const openEdit = (p: CompanyPartner) => {
        setEditingId(p.id);
        setForm({
            tipo_pessoa: p.tipo_pessoa,
            nome: p.nome,
            documento: p.documento ?? '',
            participacao_pct: String(p.participacao_pct),
            is_administrador: p.is_administrador,
            is_assinante_legal: p.is_assinante_legal,
            pj_company_id: p.pj_company_id ?? '',
            data_entrada: p.data_entrada ?? '',
            data_saida: p.data_saida ?? '',
        });
        setShowForm(true);
        setError(null);
    };

    const cancel = () => { setShowForm(false); setEditingId(null); setError(null); };

    const set = (field: keyof FormData, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const totalPct = partners
        .filter(p => !p.data_saida)
        .reduce((s, p) => s + p.participacao_pct, 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.nome.trim()) { setError('Nome é obrigatório.'); return; }
        const pct = parseFloat(form.participacao_pct);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            setError('Participação deve ser entre 0 e 100.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload: CompanyPartnerInsert = {
                company_id: companyId,
                tipo_pessoa: form.tipo_pessoa,
                nome: form.nome.trim(),
                documento: form.documento.trim() || undefined,
                participacao_pct: pct,
                is_administrador: form.is_administrador,
                is_assinante_legal: form.is_assinante_legal,
                pj_company_id: form.pj_company_id || undefined,
                data_entrada: form.data_entrada || undefined,
                data_saida: form.data_saida || undefined,
            };
            if (editingId) {
                await companyService.updatePartner(editingId, payload);
            } else {
                await companyService.createPartner(payload);
            }
            await load();
            cancel();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, nome: string) => {
        if (!confirm(`Remover "${nome}" do quadro societário?`)) return;
        try {
            await companyService.removePartner(id);
            setPartners(prev => prev.filter(p => p.id !== id));
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    return (
        <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                        Quadro Societário
                    </p>
                    {!loading && partners.length > 0 && (
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                            Math.abs(totalPct - 100) < 0.01
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                        }`}>
                            {totalPct.toFixed(2)}% distribuídos
                        </span>
                    )}
                </div>
                {!showForm && (
                    <button onClick={openNew}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Sócio
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* Formulário */}
            {showForm && (
                <form onSubmit={handleSubmit}
                    className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-widest text-blue-600">
                            {editingId ? 'Editar Sócio' : 'Novo Sócio'}
                        </p>
                        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <Field label="Tipo" required>
                            <select className={cls} value={form.tipo_pessoa}
                                onChange={e => set('tipo_pessoa', e.target.value)}>
                                <option value="pf">Pessoa Física (PF)</option>
                                <option value="pj">Pessoa Jurídica (PJ)</option>
                            </select>
                        </Field>
                        <Field label="Nome / Razão Social" required>
                            <input className={cls} value={form.nome}
                                onChange={e => set('nome', e.target.value)} />
                        </Field>
                        <Field label={form.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ'}>
                            <input className={cls} value={form.documento}
                                onChange={e => set('documento', e.target.value)} />
                        </Field>
                        <Field label="Participação (%)" required>
                            <input type="number" min="0" max="100" step="0.01"
                                className={cls} value={form.participacao_pct}
                                onChange={e => set('participacao_pct', e.target.value)} />
                        </Field>
                        <Field label="Entrada no Quadro">
                            <input type="date" className={cls} value={form.data_entrada}
                                onChange={e => set('data_entrada', e.target.value)} />
                        </Field>
                        <Field label="Saída do Quadro">
                            <input type="date" className={cls} value={form.data_saida}
                                onChange={e => set('data_saida', e.target.value)} />
                        </Field>
                        {form.tipo_pessoa === 'pj' && companies.length > 0 && (
                            <Field label="Empresa do Grupo">
                                <select className={cls} value={form.pj_company_id}
                                    onChange={e => set('pj_company_id', e.target.value)}>
                                    <option value="">Empresa externa</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.razao_social}</option>
                                    ))}
                                </select>
                            </Field>
                        )}
                        <div className="flex flex-col gap-2 justify-end pb-1">
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={form.is_administrador}
                                    onChange={e => set('is_administrador', e.target.checked)} />
                                Administrador
                            </label>
                            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={form.is_assinante_legal}
                                    onChange={e => set('is_assinante_legal', e.target.checked)} />
                                Assinante Legal
                            </label>
                        </div>
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

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
            ) : partners.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                    <Users className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium">Nenhum sócio cadastrado.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {partners.map(p => (
                        <div key={p.id}
                            className={`flex items-center gap-4 bg-white border rounded-xl px-4 py-3 ${
                                p.data_saida ? 'border-gray-100 opacity-60' : 'border-gray-200'
                            }`}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-gray-900 text-sm">{p.nome}</span>
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                        {p.tipo_pessoa === 'pf' ? 'PF' : 'PJ'}
                                    </span>
                                    {p.is_administrador && (
                                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                            <Crown className="w-3 h-3" /> Admin
                                        </span>
                                    )}
                                    {p.is_assinante_legal && (
                                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                            <PenLine className="w-3 h-3" /> Assinante
                                        </span>
                                    )}
                                    {p.data_saida && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-500">
                                            Saiu
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                    {p.documento && (
                                        <span className="text-xs text-gray-400">{p.documento}</span>
                                    )}
                                    {p.data_entrada && (
                                        <span className="text-xs text-gray-400">
                                            Entrada: {new Date(p.data_entrada).toLocaleDateString('pt-BR')}
                                        </span>
                                    )}
                                    {p.data_saida && (
                                        <span className="text-xs text-gray-400">
                                            Saída: {new Date(p.data_saida).toLocaleDateString('pt-BR')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="text-right flex-shrink-0 mr-2">
                                <p className="text-xl font-black text-blue-600">
                                    {p.participacao_pct.toFixed(2)}%
                                </p>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => openEdit(p)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(p.id, p.nome)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompanyPartnersTab;
