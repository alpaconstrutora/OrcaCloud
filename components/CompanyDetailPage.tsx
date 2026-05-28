import React, { useState } from 'react';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CheckCircle2,
    Building2, Users, Landmark, UserCheck,
} from 'lucide-react';
import {
    Company, CompanyUpdate, CompanyTipo, CompanyStatus, RegimeTributario,
    COMPANY_TIPO_LABELS, REGIME_TRIBUTARIO_LABELS, DEFAULT_MODULOS, MODULOS_POR_TIPO,
} from '../types';
import { companyService } from '../services/companyService';
import CompanyPartnersTab from './CompanyPartnersTab';
import CompanyBankAccountsTab from './CompanyBankAccountsTab';

interface Props {
    company: Company;
    companies: Company[];   // todas as empresas do org (para dropdowns)
    onBack: () => void;
    onSaved: (updated: Company) => void;
}

type Tab = 'identificacao' | 'socios' | 'bancos' | 'responsaveis';

// ─── Form ─────────────────────────────────────────────────────

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
    responsavel_legal_nome: string;
    responsavel_financeiro_nome: string;
    responsavel_operacional_nome: string;
    responsavel_tecnico_crea: string;
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
        responsavel_legal_nome: c.responsavel_legal_nome ?? '',
        responsavel_financeiro_nome: c.responsavel_financeiro_nome ?? '',
        responsavel_operacional_nome: c.responsavel_operacional_nome ?? '',
        responsavel_tecnico_crea: c.responsavel_tecnico_crea ?? '',
    };
}

function formToPayload(f: FormData): CompanyUpdate {
    return {
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
        holding_id: f.holding_id || undefined,
        responsavel_legal_nome: f.responsavel_legal_nome.trim() || undefined,
        responsavel_financeiro_nome: f.responsavel_financeiro_nome.trim() || undefined,
        responsavel_operacional_nome: f.responsavel_operacional_nome.trim() || undefined,
        responsavel_tecnico_crea: f.responsavel_tecnico_crea.trim() || undefined,
    };
}

// ─── Helpers de estilo ────────────────────────────────────────

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
const selectCls = inputCls + " cursor-pointer";
const checkboxRowCls = "flex items-center gap-2 text-sm text-gray-700 cursor-pointer";

const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean }> = ({ label, children, required }) => (
    <div>
        <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-1">
            {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {children}
    </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-3">{title}</p>
        {children}
    </div>
);

// ─── Componente principal ─────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'identificacao', label: 'Identificação', icon: <Building2 className="w-4 h-4" /> },
    { id: 'socios',        label: 'Sócios',        icon: <Users className="w-4 h-4" /> },
    { id: 'bancos',        label: 'Contas Bancárias', icon: <Landmark className="w-4 h-4" /> },
    { id: 'responsaveis',  label: 'Responsáveis',  icon: <UserCheck className="w-4 h-4" /> },
];

const CompanyDetailPage: React.FC<Props> = ({ company, companies, onBack, onSaved }) => {
    const [tab, setTab] = useState<Tab>('identificacao');
    const [form, setForm] = useState<FormData>(() => companyToForm(company));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const set = (field: keyof FormData, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const holdingOptions = companies.filter(
        c => (c.tipo === 'holding' || c.is_headquarters) && c.id !== company.id
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.razao_social.trim()) { setError('Razão social é obrigatória.'); return; }
        setSaving(true);
        setError(null);
        try {
            const updated = await companyService.update(company.id, formToPayload(form));
            onSaved(updated);
            setSuccess('Empresa salva com sucesso.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Cabeçalho */}
            <div className="flex items-start gap-4">
                <button onClick={onBack}
                    className="mt-0.5 p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: company.cor_sistema }} />
                        <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight italic border-l-4 border-blue-600 pl-4">
                            {company.razao_social}
                        </h2>
                        <span className="text-xs font-black uppercase px-3 py-1 rounded-full bg-gray-100 text-gray-500">
                            {COMPANY_TIPO_LABELS[company.tipo]}
                        </span>
                        {company.cnpj && (
                            <span className="text-xs text-gray-400">{company.cnpj}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 overflow-x-auto">
                {TABS.map(t => (
                    <button key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all whitespace-nowrap flex-shrink-0 ${
                            tab === t.id
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        {t.icon}
                        {t.label}
                    </button>
                ))}
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

            {/* ── Tab: Identificação ── */}
            {tab === 'identificacao' && (
                <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <Section title="Identificação">
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
                                <input className={inputCls} value={form.natureza_juridica}
                                    onChange={e => set('natureza_juridica', e.target.value)} />
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
                                    value={form.capital_social}
                                    onChange={e => set('capital_social', e.target.value)} />
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
                    </Section>

                    <Section title="Endereço Fiscal">
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
                                    value={form.uf_fiscal}
                                    onChange={e => set('uf_fiscal', e.target.value.toUpperCase())} />
                            </Field>
                        </div>
                    </Section>

                    <Section title="Contatos">
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
                    </Section>

                    <Section title="Tributário">
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
                    </Section>

                    {holdingOptions.length > 0 && (
                        <Section title="Grupo Econômico">
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
                                            value={form.cor_sistema}
                                            onChange={e => set('cor_sistema', e.target.value)} />
                                        <input className={inputCls} value={form.cor_sistema}
                                            onChange={e => set('cor_sistema', e.target.value)} />
                                    </div>
                                </Field>
                            </div>
                        </Section>
                    )}

                    <div className="flex justify-end pt-2 border-t border-gray-100">
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salvar Identificação
                        </button>
                    </div>
                </form>
            )}

            {/* ── Tab: Sócios ── */}
            {tab === 'socios' && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                    <CompanyPartnersTab companyId={company.id} companies={companies} />
                </div>
            )}

            {/* ── Tab: Contas Bancárias ── */}
            {tab === 'bancos' && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                    <CompanyBankAccountsTab companyId={company.id} />
                </div>
            )}

            {/* ── Tab: Responsáveis ── */}
            {tab === 'responsaveis' && (
                <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <Section title="Responsáveis da Empresa">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Responsável Legal">
                                <input className={inputCls} value={form.responsavel_legal_nome}
                                    placeholder="Nome completo"
                                    onChange={e => set('responsavel_legal_nome', e.target.value)} />
                            </Field>
                            <Field label="Responsável Financeiro">
                                <input className={inputCls} value={form.responsavel_financeiro_nome}
                                    placeholder="Nome completo"
                                    onChange={e => set('responsavel_financeiro_nome', e.target.value)} />
                            </Field>
                            <Field label="Responsável Operacional">
                                <input className={inputCls} value={form.responsavel_operacional_nome}
                                    placeholder="Nome completo"
                                    onChange={e => set('responsavel_operacional_nome', e.target.value)} />
                            </Field>
                            <Field label="Responsável Técnico (CREA/CAU)">
                                <input className={inputCls} value={form.responsavel_tecnico_crea}
                                    placeholder="Nome e número de registro"
                                    onChange={e => set('responsavel_tecnico_crea', e.target.value)} />
                            </Field>
                        </div>
                    </Section>

                    <div className="flex justify-end pt-2 border-t border-gray-100">
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Salvar Responsáveis
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default CompanyDetailPage;
