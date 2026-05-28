import React, { useState, useEffect, useCallback } from 'react';
import {
    GitBranch, Plus, Edit2, Trash2, Save, X,
    AlertCircle, Loader2, Package,
} from 'lucide-react';
import { CompanyBranch, CompanyBranchInsert, UF_LIST } from '../types';
import { companyService } from '../services/companyService';

interface Props {
    companyId: string;
}

type FormData = {
    codigo: string;
    nome: string;
    cnpj_proprio: string;
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    estoque_proprio: boolean;
    ativa: boolean;
};

const EMPTY: FormData = {
    codigo: '', nome: '', cnpj_proprio: '',
    cep: '', logradouro: '', numero: '', complemento: '',
    bairro: '', cidade: '', uf: '', estoque_proprio: false, ativa: true,
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

const CompanyBranchesTab: React.FC<Props> = ({ companyId }) => {
    const [branches, setBranches] = useState<CompanyBranch[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormData>(EMPTY);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setBranches(await companyService.listBranches(companyId));
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setEditingId(null); setForm(EMPTY); setShowForm(true); setError(null); };

    const openEdit = (b: CompanyBranch) => {
        setEditingId(b.id);
        setForm({
            codigo: b.codigo, nome: b.nome,
            cnpj_proprio: b.cnpj_proprio ?? '',
            cep: b.endereco?.cep ?? '',
            logradouro: b.endereco?.logradouro ?? '',
            numero: b.endereco?.numero ?? '',
            complemento: b.endereco?.complemento ?? '',
            bairro: b.endereco?.bairro ?? '',
            cidade: b.endereco?.cidade ?? '',
            uf: b.endereco?.uf ?? '',
            estoque_proprio: b.estoque_proprio,
            ativa: b.ativa,
        });
        setShowForm(true); setError(null);
    };

    const cancel = () => { setShowForm(false); setEditingId(null); setError(null); };
    const set = (field: keyof FormData, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.codigo.trim()) { setError('Código é obrigatório.'); return; }
        if (!form.nome.trim()) { setError('Nome é obrigatório.'); return; }
        setSaving(true); setError(null);
        try {
            const payload: CompanyBranchInsert = {
                company_id: companyId,
                codigo: form.codigo.trim(),
                nome: form.nome.trim(),
                cnpj_proprio: form.cnpj_proprio.trim() || undefined,
                endereco: {
                    cep: form.cep, logradouro: form.logradouro, numero: form.numero,
                    complemento: form.complemento, bairro: form.bairro,
                    cidade: form.cidade, uf: form.uf,
                },
                estoque_proprio: form.estoque_proprio,
                ativa: form.ativa,
            };
            if (editingId) {
                await companyService.updateBranch(editingId, payload);
            } else {
                await companyService.createBranch(payload);
            }
            await load(); cancel();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, nome: string) => {
        if (!confirm(`Excluir filial "${nome}"?`)) return;
        try {
            await companyService.removeBranch(id);
            setBranches(prev => prev.filter(b => b.id !== id));
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Filiais</p>
                {!showForm && (
                    <button onClick={openNew}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" /> Adicionar Filial
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
                            {editingId ? 'Editar Filial' : 'Nova Filial'}
                        </p>
                        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Identificação</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Field label="Código" required>
                                <input className={cls} placeholder="ex: 0001" value={form.codigo}
                                    onChange={e => set('codigo', e.target.value)} />
                            </Field>
                            <div className="md:col-span-2">
                                <Field label="Nome / Descrição" required>
                                    <input className={cls} value={form.nome}
                                        onChange={e => set('nome', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="CNPJ Próprio">
                                <input className={cls} placeholder="Se tiver CNPJ diferente"
                                    value={form.cnpj_proprio}
                                    onChange={e => set('cnpj_proprio', e.target.value)} />
                            </Field>
                        </div>
                    </div>

                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Endereço</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Field label="CEP">
                                <input className={cls} placeholder="00000-000" value={form.cep}
                                    onChange={e => set('cep', e.target.value)} />
                            </Field>
                            <div className="col-span-2">
                                <Field label="Logradouro">
                                    <input className={cls} value={form.logradouro}
                                        onChange={e => set('logradouro', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="Número">
                                <input className={cls} value={form.numero}
                                    onChange={e => set('numero', e.target.value)} />
                            </Field>
                            <Field label="Bairro">
                                <input className={cls} value={form.bairro}
                                    onChange={e => set('bairro', e.target.value)} />
                            </Field>
                            <Field label="Cidade">
                                <input className={cls} value={form.cidade}
                                    onChange={e => set('cidade', e.target.value)} />
                            </Field>
                            <Field label="UF">
                                <select className={cls} value={form.uf}
                                    onChange={e => set('uf', e.target.value)}>
                                    <option value="">-</option>
                                    {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                </select>
                            </Field>
                        </div>
                    </div>

                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={form.estoque_proprio}
                                onChange={e => set('estoque_proprio', e.target.checked)} />
                            Estoque próprio
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={form.ativa}
                                onChange={e => set('ativa', e.target.checked)} />
                            Ativa
                        </label>
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
            ) : branches.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                    <GitBranch className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma filial cadastrada.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {branches.map(b => (
                        <div key={b.id}
                            className={`flex items-center gap-4 bg-white border rounded-xl px-4 py-3 ${!b.ativa ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-black text-gray-500">{b.codigo}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-gray-900 text-sm">{b.nome}</span>
                                    {!b.ativa && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Inativa</span>
                                    )}
                                    {b.estoque_proprio && (
                                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">
                                            <Package className="w-3 h-3" /> Estoque
                                        </span>
                                    )}
                                    {b.cnpj_proprio && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">CNPJ próprio</span>
                                    )}
                                </div>
                                {(b.endereco?.cidade || b.endereco?.uf) && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {[b.endereco.logradouro, b.endereco.numero, b.endereco.cidade, b.endereco.uf].filter(Boolean).join(', ')}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => openEdit(b)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(b.id, b.nome)}
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

export default CompanyBranchesTab;
