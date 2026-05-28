import React, { useState, useEffect, useCallback } from 'react';
import {
    Landmark, Plus, Edit2, Trash2, Save, X,
    AlertCircle, Loader2, Star,
} from 'lucide-react';
import {
    CompanyBankAccount, CompanyBankAccountInsert,
    TipoConta, TipoPix,
    TIPO_CONTA_LABELS, TIPO_PIX_LABELS, BANCOS_BRASIL,
} from '../types';
import { companyService } from '../services/companyService';

interface Props {
    companyId: string;
}

type FormData = {
    banco_codigo: string;
    banco_nome: string;
    agencia: string;
    conta: string;
    tipo_conta: TipoConta | '';
    pix_chave: string;
    pix_tipo: TipoPix | '';
    favorecido: string;
    limite_credito: string;
    is_principal: boolean;
    ativa: boolean;
};

const EMPTY: FormData = {
    banco_codigo: '', banco_nome: '', agencia: '', conta: '',
    tipo_conta: '', pix_chave: '', pix_tipo: '', favorecido: '',
    limite_credito: '', is_principal: false, ativa: true,
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

const CompanyBankAccountsTab: React.FC<Props> = ({ companyId }) => {
    const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<FormData>(EMPTY);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setAccounts(await companyService.listBankAccounts(companyId));
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setEditingId(null); setForm(EMPTY); setShowForm(true); setError(null); };

    const openEdit = (a: CompanyBankAccount) => {
        setEditingId(a.id);
        setForm({
            banco_codigo: a.banco_codigo,
            banco_nome: a.banco_nome ?? '',
            agencia: a.agencia ?? '',
            conta: a.conta ?? '',
            tipo_conta: a.tipo_conta ?? '',
            pix_chave: a.pix_chave ?? '',
            pix_tipo: a.pix_tipo ?? '',
            favorecido: a.favorecido ?? '',
            limite_credito: a.limite_credito != null ? String(a.limite_credito) : '',
            is_principal: a.is_principal,
            ativa: a.ativa,
        });
        setShowForm(true);
        setError(null);
    };

    const cancel = () => { setShowForm(false); setEditingId(null); setError(null); };

    const set = (field: keyof FormData, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const handleBancoChange = (codigo: string) => {
        const banco = BANCOS_BRASIL.find(b => b.codigo === codigo);
        setForm(prev => ({
            ...prev,
            banco_codigo: codigo,
            banco_nome: banco ? banco.nome : prev.banco_nome,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.banco_codigo.trim()) { setError('Código do banco é obrigatório.'); return; }
        setSaving(true);
        setError(null);
        try {
            const payload: CompanyBankAccountInsert = {
                company_id: companyId,
                banco_codigo: form.banco_codigo.trim(),
                banco_nome: form.banco_nome.trim() || undefined,
                agencia: form.agencia.trim() || undefined,
                conta: form.conta.trim() || undefined,
                tipo_conta: (form.tipo_conta as TipoConta) || undefined,
                pix_chave: form.pix_chave.trim() || undefined,
                pix_tipo: (form.pix_tipo as TipoPix) || undefined,
                favorecido: form.favorecido.trim() || undefined,
                limite_credito: form.limite_credito ? parseFloat(form.limite_credito) : undefined,
                is_principal: form.is_principal,
                ativa: form.ativa,
            };
            if (editingId) {
                await companyService.updateBankAccount(editingId, payload);
            } else {
                await companyService.createBankAccount(payload);
            }
            await load();
            cancel();
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Remover esta conta bancária?')) return;
        try {
            await companyService.removeBankAccount(id);
            setAccounts(prev => prev.filter(a => a.id !== id));
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    return (
        <div className="space-y-4">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                    Contas Bancárias
                </p>
                {!showForm && (
                    <button onClick={openNew}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar Conta
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
                            {editingId ? 'Editar Conta' : 'Nova Conta'}
                        </p>
                        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Banco */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                            Banco
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Field label="Código do Banco" required>
                                <input list="bancos-list" className={cls}
                                    value={form.banco_codigo}
                                    onChange={e => handleBancoChange(e.target.value)}
                                    placeholder="ex: 341" />
                                <datalist id="bancos-list">
                                    {BANCOS_BRASIL.map(b => (
                                        <option key={b.codigo} value={b.codigo}>{b.nome}</option>
                                    ))}
                                </datalist>
                            </Field>
                            <div className="md:col-span-2">
                                <Field label="Nome do Banco">
                                    <input className={cls} value={form.banco_nome}
                                        onChange={e => set('banco_nome', e.target.value)}
                                        placeholder="Preenchido automaticamente" />
                                </Field>
                            </div>
                        </div>
                    </div>

                    {/* Dados da conta */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                            Dados da Conta
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Field label="Tipo de Conta">
                                <select className={cls} value={form.tipo_conta}
                                    onChange={e => set('tipo_conta', e.target.value)}>
                                    <option value="">Selecione</option>
                                    {(Object.entries(TIPO_CONTA_LABELS) as [TipoConta, string][]).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Agência">
                                <input className={cls} value={form.agencia}
                                    placeholder="0000"
                                    onChange={e => set('agencia', e.target.value)} />
                            </Field>
                            <Field label="Conta / Dígito">
                                <input className={cls} value={form.conta}
                                    placeholder="00000-0"
                                    onChange={e => set('conta', e.target.value)} />
                            </Field>
                            <Field label="Favorecido">
                                <input className={cls} value={form.favorecido}
                                    onChange={e => set('favorecido', e.target.value)} />
                            </Field>
                            <Field label="Limite de Crédito (R$)">
                                <input type="number" min="0" step="0.01" className={cls}
                                    value={form.limite_credito}
                                    onChange={e => set('limite_credito', e.target.value)} />
                            </Field>
                        </div>
                    </div>

                    {/* PIX */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                            PIX
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="Tipo de Chave">
                                <select className={cls} value={form.pix_tipo}
                                    onChange={e => set('pix_tipo', e.target.value)}>
                                    <option value="">Sem PIX</option>
                                    {(Object.entries(TIPO_PIX_LABELS) as [TipoPix, string][]).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                            </Field>
                            {form.pix_tipo && (
                                <Field label="Chave PIX">
                                    <input className={cls} value={form.pix_chave}
                                        onChange={e => set('pix_chave', e.target.value)} />
                                </Field>
                            )}
                        </div>
                    </div>

                    {/* Flags */}
                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={form.is_principal}
                                onChange={e => set('is_principal', e.target.checked)} />
                            Conta Principal
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

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
            ) : accounts.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-400 gap-2">
                    <Landmark className="w-8 h-8 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma conta cadastrada.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {accounts.map(a => (
                        <div key={a.id}
                            className={`flex items-center gap-4 bg-white border rounded-xl px-4 py-3 ${
                                !a.ativa ? 'border-gray-100 opacity-60' :
                                a.is_principal ? 'border-blue-200 bg-blue-50/30' :
                                'border-gray-200'
                            }`}>
                            {/* Ícone banco */}
                            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Landmark className="w-5 h-5 text-gray-400" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-gray-900 text-sm">
                                        {a.banco_nome ?? a.banco_codigo}
                                    </span>
                                    {a.is_principal && (
                                        <span className="flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                            <Star className="w-3 h-3" /> Principal
                                        </span>
                                    )}
                                    {a.tipo_conta && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                            {TIPO_CONTA_LABELS[a.tipo_conta]}
                                        </span>
                                    )}
                                    {!a.ativa && (
                                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                                            Inativa
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                    <span className="text-xs text-gray-400">
                                        Banco {a.banco_codigo}
                                        {a.agencia && ` | Ag. ${a.agencia}`}
                                        {a.conta && ` | CC ${a.conta}`}
                                    </span>
                                    {a.pix_chave && (
                                        <span className="text-xs text-gray-400">
                                            PIX ({TIPO_PIX_LABELS[a.pix_tipo!]}): {a.pix_chave}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {a.limite_credito != null && (
                                <div className="text-right flex-shrink-0 mr-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Limite</p>
                                    <p className="text-sm font-black text-gray-700">
                                        {a.limite_credito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button onClick={() => openEdit(a)}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(a.id)}
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

export default CompanyBankAccountsTab;
