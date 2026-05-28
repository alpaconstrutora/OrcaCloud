import React, { useState, useEffect, useCallback } from 'react';
import {
    Building2, Plus, Trash2, Star, ChevronDown, ChevronUp,
    Save, X, AlertCircle, Loader2, CheckCircle2, Settings2,
} from 'lucide-react';
import {
    Company, CompanyInsert,
    CompanyTipo, CompanyStatus, RegimeTributario,
    COMPANY_TIPO_LABELS, REGIME_TRIBUTARIO_LABELS,
    DEFAULT_MODULOS, MODULOS_POR_TIPO,
} from '../types';
import { companyService } from '../services/companyService';
import CompanyDetailPage from './CompanyDetailPage';

interface CompaniesModuleProps {
    orgId: string;
}

// ─── Form state ───────────────────────────────────────────────

type FormData = {
    razao_social: string;
    nome_fantasia: string;
    cnpj: string;
    inscricao_estadual: string;
    inscricao_municipal: string;
    cnae_principal: string;
    natureza_juridica: string;
    regime_tributario: RegimeTributario | '';
    data_abertura: string;
    capital_social: string;
    status: CompanyStatus;
    tipo: CompanyTipo;
    cor_sistema: string;
    telefone: string;
    email_financeiro: string;
    email_fiscal: string;
    email_comercial: string;
    website: string;
    crt: string;
    retencao_iss: boolean;
    retencao_inss: boolean;
    retencao_irrf: boolean;
    cep_fiscal: string;
    logradouro_fiscal: string;
    numero_fiscal: string;
    complemento_fiscal: string;
    bairro_fiscal: string;
    cidade_fiscal: string;
    uf_fiscal: string;
    holding_id: string;
};

const EMPTY_FORM: FormData = {
    razao_social: '', nome_fantasia: '', cnpj: '', inscricao_estadual: '',
    inscricao_municipal: '', cnae_principal: '', natureza_juridica: '',
    regime_tributario: '', data_abertura: '', capital_social: '',
    status: 'ativa', tipo: 'construtora', cor_sistema: '#2563EB',
    telefone: '', email_financeiro: '', email_fiscal: '', email_comercial: '',
    website: '', crt: '', retencao_iss: false, retencao_inss: false, retencao_irrf: false,
    cep_fiscal: '', logradouro_fiscal: '', numero_fiscal: '', complemento_fiscal: '',
    bairro_fiscal: '', cidade_fiscal: '', uf_fiscal: '', holding_id: '',
};

function companyToForm(c: Company): FormData {
    return {
        razao_social: c.razao_social,
        nome_fantasia: c.nome_fantasia ?? '',
        cnpj: c.cnpj ?? '',
        inscricao_estadual: c.inscricao_estadual ?? '',
        inscricao_municipal: c.inscricao_municipal ?? '',
        cnae_principal: c.cnae_principal ?? '',
        natureza_juridica: c.natureza_juridica ?? '',
        regime_tributario: c.regime_tributario ?? '',
        data_abertura: c.data_abertura ?? '',
        capital_social: c.capital_social != null ? String(c.capital_social) : '',
        status: c.status,
        tipo: c.tipo,
        cor_sistema: c.cor_sistema,
        telefone: c.telefone ?? '',
        email_financeiro: c.email_financeiro ?? '',
        email_fiscal: c.email_fiscal ?? '',
        email_comercial: c.email_comercial ?? '',
        website: c.website ?? '',
        crt: c.crt ?? '',
        retencao_iss: c.retencao_iss,
        retencao_inss: c.retencao_inss,
        retencao_irrf: c.retencao_irrf,
        cep_fiscal: c.endereco_fiscal?.cep ?? '',
        logradouro_fiscal: c.endereco_fiscal?.logradouro ?? '',
        numero_fiscal: c.endereco_fiscal?.numero ?? '',
        complemento_fiscal: c.endereco_fiscal?.complemento ?? '',
        bairro_fiscal: c.endereco_fiscal?.bairro ?? '',
        cidade_fiscal: c.endereco_fiscal?.cidade ?? '',
        uf_fiscal: c.endereco_fiscal?.uf ?? '',
        holding_id: c.holding_id ?? '',
    };
}

function formToPayload(f: FormData, orgId: string): CompanyInsert {
    return {
        org_id: orgId,
        razao_social: f.razao_social.trim(),
        nome_fantasia: f.nome_fantasia.trim() || undefined,
        cnpj: f.cnpj.trim() || undefined,
        inscricao_estadual: f.inscricao_estadual.trim() || undefined,
        inscricao_municipal: f.inscricao_municipal.trim() || undefined,
        cnae_principal: f.cnae_principal.trim() || undefined,
        natureza_juridica: f.natureza_juridica.trim() || undefined,
        regime_tributario: (f.regime_tributario as RegimeTributario) || undefined,
        data_abertura: f.data_abertura || undefined,
        capital_social: f.capital_social ? parseFloat(f.capital_social) : undefined,
        status: f.status,
        tipo: f.tipo,
        cor_sistema: f.cor_sistema,
        logo_url: undefined,
        endereco_fiscal: {
            cep: f.cep_fiscal, logradouro: f.logradouro_fiscal, numero: f.numero_fiscal,
            complemento: f.complemento_fiscal, bairro: f.bairro_fiscal,
            cidade: f.cidade_fiscal, uf: f.uf_fiscal,
        },
        telefone: f.telefone.trim() || undefined,
        email_financeiro: f.email_financeiro.trim() || undefined,
        email_fiscal: f.email_fiscal.trim() || undefined,
        email_comercial: f.email_comercial.trim() || undefined,
        website: f.website.trim() || undefined,
        modulos_habilitados: { ...DEFAULT_MODULOS, ...MODULOS_POR_TIPO[f.tipo] },
        crt: f.crt.trim() || undefined,
        retencao_iss: f.retencao_iss,
        retencao_inss: f.retencao_inss,
        retencao_irrf: f.retencao_irrf,
        is_headquarters: false,
        holding_id: f.holding_id || undefined,
        // Sprint B defaults
        retencao_pis: false,
        retencao_cofins: false,
        retencao_csll: false,
        possui_substituicao_tributaria: false,
        possui_difal: false,
        possui_inss_obra: false,
        cprb: false,
        sefaz_integrada: false,
    };
}

// ─── Sub-components ───────────────────────────────────────────

const Field: React.FC<{
    label: string;
    children: React.ReactNode;
    required?: boolean;
}> = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">
            {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {children}
    </div>
);

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
const selectCls = inputCls + " cursor-pointer";
const checkboxRowCls = "flex items-center gap-2 text-sm text-gray-700 cursor-pointer";

// ─── Main component ───────────────────────────────────────────

const CompaniesModule: React.FC<CompaniesModuleProps> = ({ orgId }) => {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [form, setForm] = useState<FormData>(EMPTY_FORM);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const data = await companyService.list(orgId);
            setCompanies(data);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setForm(EMPTY_FORM);
        setShowForm(true);
        setError(null);
    };

    const cancel = () => {
        setShowForm(false);
        setError(null);
    };

    const set = (field: keyof FormData, value: string | boolean) => {
        setForm(prev => {
            const next = { ...prev, [field]: value };
            // Auto-fill modulos when tipo changes
            if (field === 'tipo') { /* handled on save */ }
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.razao_social.trim()) { setError('Razão social é obrigatória.'); return; }
        setSaving(true);
        setError(null);
        try {
            await companyService.create(formToPayload(form, orgId));
            setSuccess('Empresa cadastrada. Clique em "Gerenciar" para adicionar sócios e contas bancárias.');
            await load();
            setShowForm(false);
            setTimeout(() => setSuccess(null), 5000);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, razao: string) => {
        if (!confirm(`Excluir "${razao}"? Esta ação não pode ser desfeita.`)) return;
        try {
            await companyService.remove(id);
            setCompanies(prev => prev.filter(c => c.id !== id));
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    const holdingOptions = companies.filter(c => c.tipo === 'holding' || c.is_headquarters);

    // ── Sem org selecionada ───────────────────────────────────
    if (!orgId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                <Building2 className="w-10 h-10 opacity-30" />
                <p className="text-sm font-black uppercase tracking-wide">Nenhuma organização selecionada</p>
                <p className="text-xs">Selecione uma organização na aba "Organização" para gerenciar as empresas do grupo.</p>
            </div>
        );
    }

    // ── Modo detalhe ──────────────────────────────────────────
    if (selectedCompany) {
        return (
            <CompanyDetailPage
                company={selectedCompany}
                companies={companies}
                onBack={() => setSelectedCompany(null)}
                onSaved={(updated) => {
                    setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
                    setSelectedCompany(updated);
                }}
            />
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight italic border-l-4 border-blue-600 pl-4">
                        Empresas do Grupo
                    </h2>
                    <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">
                        CNPJs, tipos e configurações de cada empresa do grupo econômico.
                    </p>
                </div>
                {!showForm && (
                    <button
                        onClick={openNew}
                        className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.15em] hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Empresa
                    </button>
                )}
            </div>

            {/* Feedback */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    {success}
                </div>
            )}

            {/* Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-black text-gray-900 uppercase tracking-wide text-sm">
                            Nova Empresa
                        </h3>
                        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Seção 1 — Identificação */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">Identificação</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Field label="Razão Social" required>
                                <input className={inputCls} value={form.razao_social}
                                    onChange={e => set('razao_social', e.target.value)} />
                            </Field>
                            <Field label="Nome Fantasia">
                                <input className={inputCls} value={form.nome_fantasia}
                                    onChange={e => set('nome_fantasia', e.target.value)} />
                            </Field>
                            <Field label="CNPJ">
                                <input className={inputCls} placeholder="00.000.000/0001-00"
                                    value={form.cnpj} onChange={e => set('cnpj', e.target.value)} />
                            </Field>
                            <Field label="Inscrição Estadual">
                                <input className={inputCls} value={form.inscricao_estadual}
                                    onChange={e => set('inscricao_estadual', e.target.value)} />
                            </Field>
                            <Field label="Inscrição Municipal">
                                <input className={inputCls} value={form.inscricao_municipal}
                                    onChange={e => set('inscricao_municipal', e.target.value)} />
                            </Field>
                            <Field label="CNAE Principal">
                                <input className={inputCls} placeholder="0000-0/00"
                                    value={form.cnae_principal} onChange={e => set('cnae_principal', e.target.value)} />
                            </Field>
                            <Field label="Natureza Jurídica">
                                <input className={inputCls} placeholder="ex: Sociedade Limitada"
                                    value={form.natureza_juridica} onChange={e => set('natureza_juridica', e.target.value)} />
                            </Field>
                            <Field label="Regime Tributário">
                                <select className={selectCls} value={form.regime_tributario}
                                    onChange={e => set('regime_tributario', e.target.value)}>
                                    <option value="">Selecione</option>
                                    {(Object.entries(REGIME_TRIBUTARIO_LABELS) as [RegimeTributario, string][]).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Tipo de Empresa" required>
                                <select className={selectCls} value={form.tipo}
                                    onChange={e => set('tipo', e.target.value)}>
                                    {(Object.entries(COMPANY_TIPO_LABELS) as [CompanyTipo, string][]).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Data de Abertura">
                                <input type="date" className={inputCls} value={form.data_abertura}
                                    onChange={e => set('data_abertura', e.target.value)} />
                            </Field>
                            <Field label="Capital Social (R$)">
                                <input type="number" min="0" step="0.01" className={inputCls}
                                    value={form.capital_social} onChange={e => set('capital_social', e.target.value)} />
                            </Field>
                            <Field label="Status">
                                <select className={selectCls} value={form.status}
                                    onChange={e => set('status', e.target.value as CompanyStatus)}>
                                    <option value="ativa">Ativa</option>
                                    <option value="inativa">Inativa</option>
                                    <option value="em_implantacao">Em Implantação</option>
                                    <option value="encerrada">Encerrada</option>
                                </select>
                            </Field>
                        </div>
                    </div>

                    {/* Seção 2 — Endereço Fiscal */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">Endereço Fiscal</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Field label="CEP">
                                <input className={inputCls} placeholder="00000-000" value={form.cep_fiscal}
                                    onChange={e => set('cep_fiscal', e.target.value)} />
                            </Field>
                            <div className="col-span-2">
                                <Field label="Logradouro">
                                    <input className={inputCls} value={form.logradouro_fiscal}
                                        onChange={e => set('logradouro_fiscal', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="Número">
                                <input className={inputCls} value={form.numero_fiscal}
                                    onChange={e => set('numero_fiscal', e.target.value)} />
                            </Field>
                            <Field label="Complemento">
                                <input className={inputCls} value={form.complemento_fiscal}
                                    onChange={e => set('complemento_fiscal', e.target.value)} />
                            </Field>
                            <Field label="Bairro">
                                <input className={inputCls} value={form.bairro_fiscal}
                                    onChange={e => set('bairro_fiscal', e.target.value)} />
                            </Field>
                            <Field label="Cidade">
                                <input className={inputCls} value={form.cidade_fiscal}
                                    onChange={e => set('cidade_fiscal', e.target.value)} />
                            </Field>
                            <Field label="UF">
                                <input className={inputCls} maxLength={2} placeholder="SP"
                                    value={form.uf_fiscal} onChange={e => set('uf_fiscal', e.target.value.toUpperCase())} />
                            </Field>
                        </div>
                    </div>

                    {/* Seção 3 — Contatos */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">Contatos</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Field label="Telefone">
                                <input className={inputCls} value={form.telefone}
                                    onChange={e => set('telefone', e.target.value)} />
                            </Field>
                            <Field label="E-mail Financeiro">
                                <input type="email" className={inputCls} value={form.email_financeiro}
                                    onChange={e => set('email_financeiro', e.target.value)} />
                            </Field>
                            <Field label="E-mail Fiscal">
                                <input type="email" className={inputCls} value={form.email_fiscal}
                                    onChange={e => set('email_fiscal', e.target.value)} />
                            </Field>
                            <Field label="E-mail Comercial">
                                <input type="email" className={inputCls} value={form.email_comercial}
                                    onChange={e => set('email_comercial', e.target.value)} />
                            </Field>
                            <Field label="Website">
                                <input className={inputCls} value={form.website}
                                    onChange={e => set('website', e.target.value)} />
                            </Field>
                        </div>
                    </div>

                    {/* Seção 4 — Tributário */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">Tributário</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Field label="CRT">
                                <select className={selectCls} value={form.crt}
                                    onChange={e => set('crt', e.target.value)}>
                                    <option value="">Selecione</option>
                                    <option value="1">1 – Simples Nacional</option>
                                    <option value="2">2 – Simples Nacional – Excesso de Sublimite</option>
                                    <option value="3">3 – Regime Normal</option>
                                    <option value="4">4 – Simples Nacional – MEI</option>
                                </select>
                            </Field>
                            <div className="flex flex-col gap-2 justify-end pb-1">
                                <label className={checkboxRowCls}>
                                    <input type="checkbox" checked={form.retencao_iss}
                                        onChange={e => set('retencao_iss', e.target.checked)} />
                                    Retém ISS
                                </label>
                                <label className={checkboxRowCls}>
                                    <input type="checkbox" checked={form.retencao_inss}
                                        onChange={e => set('retencao_inss', e.target.checked)} />
                                    Retém INSS
                                </label>
                                <label className={checkboxRowCls}>
                                    <input type="checkbox" checked={form.retencao_irrf}
                                        onChange={e => set('retencao_irrf', e.target.checked)} />
                                    Retém IRRF
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Seção 5 — Grupo Econômico */}
                    {holdingOptions.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">Grupo Econômico</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Empresa Controladora (Holding)">
                                    <select className={selectCls} value={form.holding_id}
                                        onChange={e => set('holding_id', e.target.value)}>
                                        <option value="">Nenhuma</option>
                                        {holdingOptions.map(c => (
                                            <option key={c.id} value={c.id}>{c.razao_social}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Cor no Sistema">
                                    <div className="flex items-center gap-2">
                                        <input type="color" className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                                            value={form.cor_sistema} onChange={e => set('cor_sistema', e.target.value)} />
                                        <input className={inputCls} value={form.cor_sistema}
                                            onChange={e => set('cor_sistema', e.target.value)} />
                                    </div>
                                </Field>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                        <button type="button" onClick={cancel}
                            className="px-5 py-2 text-sm font-black uppercase tracking-wide text-gray-500 hover:text-gray-700 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Cadastrar Empresa
                        </button>
                    </div>
                </form>
            )}

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-sm font-medium">Carregando empresas...</span>
                </div>
            ) : companies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
                    <Building2 className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-medium">Nenhuma empresa cadastrada.</p>
                    <p className="text-xs">Clique em "Nova Empresa" para começar.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {companies.map(c => (
                        <div key={c.id}
                            className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            {/* Card header */}
                            <div className="flex items-center gap-4 px-5 py-4">
                                {/* Color badge */}
                                <div className="w-2 h-10 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: c.cor_sistema }} />

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-black text-gray-900 text-sm truncate">{c.razao_social}</span>
                                        {c.is_headquarters && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-wide">
                                                <Star className="w-3 h-3" /> Sede
                                            </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                                            c.status === 'ativa' ? 'bg-green-100 text-green-700' :
                                            c.status === 'encerrada' ? 'bg-red-100 text-red-700' :
                                            c.status === 'em_implantacao' ? 'bg-blue-100 text-blue-700' :
                                            'bg-gray-100 text-gray-500'
                                        }`}>
                                            {c.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                        <span className="text-xs text-gray-400">{COMPANY_TIPO_LABELS[c.tipo]}</span>
                                        {c.cnpj && <span className="text-xs text-gray-400">CNPJ: {c.cnpj}</span>}
                                        {c.regime_tributario && (
                                            <span className="text-xs text-gray-400">{REGIME_TRIBUTARIO_LABELS[c.regime_tributario]}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => setSelectedCompany(c)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs font-black uppercase tracking-wide">
                                        <Settings2 className="w-3.5 h-3.5" />
                                        Gerenciar
                                    </button>
                                    {!c.is_headquarters && (
                                        <button onClick={() => handleDelete(c.id, c.razao_social)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                                        {expandedId === c.id
                                            ? <ChevronUp className="w-4 h-4" />
                                            : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {expandedId === c.id && (
                                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {c.endereco_fiscal?.logradouro && (
                                        <div className="col-span-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Endereço Fiscal</p>
                                            <p className="text-xs text-gray-700">
                                                {c.endereco_fiscal.logradouro}, {c.endereco_fiscal.numero}
                                                {c.endereco_fiscal.complemento && ` — ${c.endereco_fiscal.complemento}`}
                                                <br />{c.endereco_fiscal.bairro} — {c.endereco_fiscal.cidade}/{c.endereco_fiscal.uf}
                                                {c.endereco_fiscal.cep && ` — ${c.endereco_fiscal.cep}`}
                                            </p>
                                        </div>
                                    )}
                                    {c.email_financeiro && (
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">E-mail Financeiro</p>
                                            <p className="text-xs text-gray-700">{c.email_financeiro}</p>
                                        </div>
                                    )}
                                    {c.email_fiscal && (
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">E-mail Fiscal</p>
                                            <p className="text-xs text-gray-700">{c.email_fiscal}</p>
                                        </div>
                                    )}
                                    {c.capital_social != null && (
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Capital Social</p>
                                            <p className="text-xs text-gray-700">
                                                {c.capital_social.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Módulos Ativos</p>
                                        <p className="text-xs text-gray-700">
                                            {Object.entries(c.modulos_habilitados)
                                                .filter(([, v]) => v)
                                                .map(([k]) => k)
                                                .join(', ')}
                                        </p>
                                    </div>
                                    <div className="flex gap-4">
                                        {c.retencao_iss && <span className="text-[10px] font-black uppercase text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">Ret. ISS</span>}
                                        {c.retencao_inss && <span className="text-[10px] font-black uppercase text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">Ret. INSS</span>}
                                        {c.retencao_irrf && <span className="text-[10px] font-black uppercase text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">Ret. IRRF</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompaniesModule;
