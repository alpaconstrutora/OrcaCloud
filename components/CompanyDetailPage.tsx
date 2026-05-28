import React, { useRef, useState } from 'react';
import {
    ArrowLeft, Save, Loader2, AlertCircle, CheckCircle2,
    Building2, Users, Landmark, UserCheck, TrendingUp, Receipt,
    Upload, Download, FileKey,
} from 'lucide-react';
import {
    Company, CompanyUpdate, CompanyTipo, CompanyStatus, RegimeTributario,
    COMPANY_TIPO_LABELS, REGIME_TRIBUTARIO_LABELS, REGIME_CONTABIL_LABELS,
    DEFAULT_MODULOS, MODULOS_POR_TIPO,
} from '../types';
import { companyService } from '../services/companyService';
import CompanyPartnersTab from './CompanyPartnersTab';
import CompanyBankAccountsTab from './CompanyBankAccountsTab';
import CertificateExpiryWarning from './CertificateExpiryWarning';

interface Props {
    company: Company;
    companies: Company[];
    onBack: () => void;
    onSaved: (updated: Company) => void;
}

type Tab = 'identificacao' | 'socios' | 'bancos' | 'responsaveis' | 'financeiro' | 'tributario';

// ─── Form ─────────────────────────────────────────────────────

type FormData = {
    // Identificação
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
    // Endereço
    cep_fiscal: string;
    logradouro_fiscal: string;
    numero_fiscal: string;
    complemento_fiscal: string;
    bairro_fiscal: string;
    cidade_fiscal: string;
    uf_fiscal: string;
    // Contatos
    telefone: string;
    email_financeiro: string;
    email_fiscal: string;
    email_comercial: string;
    website: string;
    // Tributário básico
    crt: string;
    retencao_iss: boolean;
    retencao_inss: boolean;
    retencao_irrf: boolean;
    // Grupo
    holding_id: string;
    // Responsáveis
    responsavel_legal_nome: string;
    responsavel_financeiro_nome: string;
    responsavel_operacional_nome: string;
    responsavel_tecnico_crea: string;
    // Sprint B — Financeiro
    regime_contabil: 'caixa' | 'competencia' | '';
    limite_aprovacao_compras: string;
    limite_aprovacao_pagamentos: string;
    empresa_consolidadora_id: string;
    // Sprint B — Tributário avançado
    aliquota_iss: string;
    codigo_servico_municipal: string;
    cnae_fiscal: string;
    retencao_pis: boolean;
    retencao_cofins: boolean;
    retencao_csll: boolean;
    possui_substituicao_tributaria: boolean;
    possui_difal: boolean;
    possui_inss_obra: boolean;
    cprb: boolean;
    certificado_validade: string;
    prefeitura_integrada: string;
    sefaz_integrada: boolean;
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
        cep_fiscal: c.endereco_fiscal?.cep ?? '',
        logradouro_fiscal: c.endereco_fiscal?.logradouro ?? '',
        numero_fiscal: c.endereco_fiscal?.numero ?? '',
        complemento_fiscal: c.endereco_fiscal?.complemento ?? '',
        bairro_fiscal: c.endereco_fiscal?.bairro ?? '',
        cidade_fiscal: c.endereco_fiscal?.cidade ?? '',
        uf_fiscal: c.endereco_fiscal?.uf ?? '',
        telefone: c.telefone ?? '',
        email_financeiro: c.email_financeiro ?? '',
        email_fiscal: c.email_fiscal ?? '',
        email_comercial: c.email_comercial ?? '',
        website: c.website ?? '',
        crt: c.crt ?? '',
        retencao_iss: c.retencao_iss,
        retencao_inss: c.retencao_inss,
        retencao_irrf: c.retencao_irrf,
        holding_id: c.holding_id ?? '',
        responsavel_legal_nome: c.responsavel_legal_nome ?? '',
        responsavel_financeiro_nome: c.responsavel_financeiro_nome ?? '',
        responsavel_operacional_nome: c.responsavel_operacional_nome ?? '',
        responsavel_tecnico_crea: c.responsavel_tecnico_crea ?? '',
        regime_contabil: c.regime_contabil ?? '',
        limite_aprovacao_compras: c.limite_aprovacao_compras != null ? String(c.limite_aprovacao_compras) : '',
        limite_aprovacao_pagamentos: c.limite_aprovacao_pagamentos != null ? String(c.limite_aprovacao_pagamentos) : '',
        empresa_consolidadora_id: c.empresa_consolidadora_id ?? '',
        aliquota_iss: c.aliquota_iss != null ? String(c.aliquota_iss) : '',
        codigo_servico_municipal: c.codigo_servico_municipal ?? '',
        cnae_fiscal: c.cnae_fiscal ?? '',
        retencao_pis: c.retencao_pis ?? false,
        retencao_cofins: c.retencao_cofins ?? false,
        retencao_csll: c.retencao_csll ?? false,
        possui_substituicao_tributaria: c.possui_substituicao_tributaria ?? false,
        possui_difal: c.possui_difal ?? false,
        possui_inss_obra: c.possui_inss_obra ?? false,
        cprb: c.cprb ?? false,
        certificado_validade: c.certificado_validade ?? '',
        prefeitura_integrada: c.prefeitura_integrada ?? '',
        sefaz_integrada: c.sefaz_integrada ?? false,
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
        regime_contabil: (f.regime_contabil as 'caixa' | 'competencia') || undefined,
        limite_aprovacao_compras: f.limite_aprovacao_compras ? parseFloat(f.limite_aprovacao_compras) : undefined,
        limite_aprovacao_pagamentos: f.limite_aprovacao_pagamentos ? parseFloat(f.limite_aprovacao_pagamentos) : undefined,
        empresa_consolidadora_id: f.empresa_consolidadora_id || undefined,
        aliquota_iss: f.aliquota_iss ? parseFloat(f.aliquota_iss) : undefined,
        codigo_servico_municipal: f.codigo_servico_municipal.trim() || undefined,
        cnae_fiscal: f.cnae_fiscal.trim() || undefined,
        retencao_pis: f.retencao_pis,
        retencao_cofins: f.retencao_cofins,
        retencao_csll: f.retencao_csll,
        possui_substituicao_tributaria: f.possui_substituicao_tributaria,
        possui_difal: f.possui_difal,
        possui_inss_obra: f.possui_inss_obra,
        cprb: f.cprb,
        certificado_validade: f.certificado_validade || undefined,
        prefeitura_integrada: f.prefeitura_integrada.trim() || undefined,
        sefaz_integrada: f.sefaz_integrada,
    };
}

// ─── Sugestão de retenções por regime tributário ─────────────

type RetencaoSugestao = {
    pis: boolean; cofins: boolean; csll: boolean;
    irrf: boolean; iss: boolean; inss: boolean;
};

function sugestaoRetencao(regime: RegimeTributario | ''): RetencaoSugestao | null {
    if (!regime) return null;
    if (regime === 'simples' || regime === 'mei') {
        return { pis: false, cofins: false, csll: false, irrf: false, iss: false, inss: false };
    }
    return { pis: true, cofins: true, csll: true, irrf: true, iss: true, inss: true };
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

// ─── Tabs config ──────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'identificacao', label: 'Identificação',     icon: <Building2 className="w-4 h-4" /> },
    { id: 'socios',        label: 'Sócios',            icon: <Users className="w-4 h-4" /> },
    { id: 'bancos',        label: 'Contas Bancárias',  icon: <Landmark className="w-4 h-4" /> },
    { id: 'financeiro',    label: 'Financeiro',        icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'tributario',    label: 'Tributário',        icon: <Receipt className="w-4 h-4" /> },
    { id: 'responsaveis',  label: 'Responsáveis',      icon: <UserCheck className="w-4 h-4" /> },
];

// ─── Componente principal ─────────────────────────────────────

const CompanyDetailPage: React.FC<Props> = ({ company, companies, onBack, onSaved }) => {
    const [tab, setTab] = useState<Tab>('identificacao');
    const [form, setForm] = useState<FormData>(() => companyToForm(company));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Certificado upload
    const certInputRef = useRef<HTMLInputElement>(null);
    const [uploadingCert, setUploadingCert] = useState(false);
    const [certUrl, setCertUrl] = useState<string | null>(company.certificado_digital_url ?? null);

    const set = (field: keyof FormData, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const holdingOptions = companies.filter(
        c => (c.tipo === 'holding' || c.is_headquarters) && c.id !== company.id
    );
    const consolidadoraOptions = companies.filter(c => c.id !== company.id);

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.razao_social.trim()) { setError('Razão social é obrigatória.'); return; }
        setSaving(true);
        setError(null);
        try {
            const updated = await companyService.update(company.id, formToPayload(form));
            onSaved(updated);
            showSuccess('Empresa salva com sucesso.');
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingCert(true);
        setError(null);
        try {
            const path = await companyService.uploadCertificado(company.id, file);
            await companyService.update(company.id, { certificado_digital_url: path });
            setCertUrl(path);
            showSuccess('Certificado enviado com sucesso.');
        } catch (e: unknown) {
            setError((e as Error).message);
        } finally {
            setUploadingCert(false);
            if (certInputRef.current) certInputRef.current.value = '';
        }
    };

    const handleCertDownload = async () => {
        if (!certUrl) return;
        try {
            const url = await companyService.getCertificadoSignedUrl(certUrl);
            window.open(url, '_blank');
        } catch (e: unknown) {
            setError((e as Error).message);
        }
    };

    const aplicarSugestaoRetencao = () => {
        const s = sugestaoRetencao(form.regime_tributario);
        if (!s) return;
        setForm(prev => ({
            ...prev,
            retencao_pis: s.pis,
            retencao_cofins: s.cofins,
            retencao_csll: s.csll,
            retencao_irrf: s.irrf,
            retencao_iss: s.iss,
            retencao_inss: s.inss,
        }));
    };

    const SaveButton: React.FC = () => (
        <div className="flex justify-end pt-2 border-t border-gray-100">
            <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-60 active:scale-95">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
            </button>
        </div>
    );

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
                        {company.cnpj && <span className="text-xs text-gray-400">{company.cnpj}</span>}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 overflow-x-auto">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wide transition-all whitespace-nowrap flex-shrink-0 ${
                            tab === t.id
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}>
                        {t.icon}{t.label}
                    </button>
                ))}
            </div>

            {/* Feedback */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{success}
                </div>
            )}

            {/* ── Tab: Identificação ────────────────────────────────── */}
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

                    <Section title="Tributário Básico">
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
                                        <input type="color"
                                            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                                            value={form.cor_sistema}
                                            onChange={e => set('cor_sistema', e.target.value)} />
                                        <input className={inputCls} value={form.cor_sistema}
                                            onChange={e => set('cor_sistema', e.target.value)} />
                                    </div>
                                </Field>
                            </div>
                        </Section>
                    )}

                    <SaveButton />
                </form>
            )}

            {/* ── Tab: Sócios ───────────────────────────────────────── */}
            {tab === 'socios' && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                    <CompanyPartnersTab companyId={company.id} companies={companies} />
                </div>
            )}

            {/* ── Tab: Contas Bancárias ─────────────────────────────── */}
            {tab === 'bancos' && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                    <CompanyBankAccountsTab companyId={company.id} />
                </div>
            )}

            {/* ── Tab: Financeiro ───────────────────────────────────── */}
            {tab === 'financeiro' && (
                <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <Section title="Regime Contábil e Limites">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Field label="Regime Contábil">
                                <select className={selectCls} value={form.regime_contabil}
                                    onChange={e => set('regime_contabil', e.target.value)}>
                                    <option value="">Selecione</option>
                                    {(Object.entries(REGIME_CONTABIL_LABELS) as ['caixa' | 'competencia', string][]).map(([v, l]) => (
                                        <option key={v} value={v}>{l}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Limite Aprovação Compras (R$)">
                                <input type="number" min="0" step="0.01" className={inputCls}
                                    placeholder="Sem limite"
                                    value={form.limite_aprovacao_compras}
                                    onChange={e => set('limite_aprovacao_compras', e.target.value)} />
                            </Field>
                            <Field label="Limite Aprovação Pagamentos (R$)">
                                <input type="number" min="0" step="0.01" className={inputCls}
                                    placeholder="Sem limite"
                                    value={form.limite_aprovacao_pagamentos}
                                    onChange={e => set('limite_aprovacao_pagamentos', e.target.value)} />
                            </Field>
                        </div>
                        {(form.limite_aprovacao_compras || form.limite_aprovacao_pagamentos) && (
                            <p className="mt-2 text-xs text-gray-400">
                                Valores acima desses limites exigirão aprovação de nível superior no workflow de compras/pagamentos.
                            </p>
                        )}
                    </Section>

                    <Section title="Consolidação do Grupo">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Empresa Consolidadora">
                                <select className={selectCls} value={form.empresa_consolidadora_id}
                                    onChange={e => set('empresa_consolidadora_id', e.target.value)}>
                                    <option value="">Esta empresa é independente</option>
                                    {consolidadoraOptions.map(c => (
                                        <option key={c.id} value={c.id}>{c.razao_social}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                            Define qual empresa agrega os relatórios financeiros desta no DRE e fluxo de caixa consolidado.
                        </p>
                    </Section>

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-600">
                        <p className="font-black uppercase tracking-wide mb-1">Plano de Contas e Centro de Custo Padrão</p>
                        <p>Configuração disponível após o módulo Financeiro ser ativado para esta empresa. Use a aba <strong>Identificação → Módulos</strong> para habilitar.</p>
                    </div>

                    <SaveButton />
                </form>
            )}

            {/* ── Tab: Tributário Avançado ──────────────────────────── */}
            {tab === 'tributario' && (
                <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">

                    {/* Sugestão por regime */}
                    {form.regime_tributario && (
                        <div className="flex items-start justify-between gap-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-blue-700 mb-1">
                                    Regime: {REGIME_TRIBUTARIO_LABELS[form.regime_tributario as RegimeTributario]}
                                </p>
                                <p className="text-xs text-blue-600">
                                    {form.regime_tributario === 'simples' || form.regime_tributario === 'mei'
                                        ? 'Empresas do Simples/MEI geralmente são dispensadas de retenção de PIS/COFINS/CSLL na fonte (LC 123/2006).'
                                        : 'Empresas de Lucro Presumido/Real estão sujeitas às retenções de PIS/COFINS/CSLL na fonte conforme Lei 10.833/2003.'}
                                </p>
                            </div>
                            <button type="button" onClick={aplicarSugestaoRetencao}
                                className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wide hover:bg-blue-700 transition-all active:scale-95">
                                Aplicar sugestão
                            </button>
                        </div>
                    )}

                    <Section title="ISS e Serviços">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Field label="Alíquota ISS (%)">
                                <input type="number" min="0" max="5" step="0.01" className={inputCls}
                                    placeholder="ex: 2.00"
                                    value={form.aliquota_iss}
                                    onChange={e => set('aliquota_iss', e.target.value)} />
                            </Field>
                            <Field label="Código de Serviço Municipal">
                                <input className={inputCls} placeholder="ex: 7.02"
                                    value={form.codigo_servico_municipal}
                                    onChange={e => set('codigo_servico_municipal', e.target.value)} />
                            </Field>
                            <Field label="CNAE Fiscal">
                                <input className={inputCls} placeholder="0000-0/00"
                                    value={form.cnae_fiscal}
                                    onChange={e => set('cnae_fiscal', e.target.value)} />
                            </Field>
                        </div>
                    </Section>

                    <Section title="Retenções na Fonte">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            {([
                                ['retencao_pis',    'PIS'],
                                ['retencao_cofins', 'COFINS'],
                                ['retencao_csll',   'CSLL'],
                                ['retencao_irrf',   'IRRF'],
                                ['retencao_iss',    'ISS'],
                                ['retencao_inss',   'INSS'],
                            ] as [keyof FormData, string][]).map(([field, label]) => (
                                <label key={field}
                                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                        form[field]
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                    }`}>
                                    <input type="checkbox" className="hidden"
                                        checked={form[field] as boolean}
                                        onChange={e => set(field, e.target.checked)} />
                                    <span className="text-sm font-black">{label}</span>
                                    <span className="text-[10px] uppercase font-black">
                                        {form[field] ? 'Retém' : 'Não retém'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </Section>

                    <Section title="Regimes Especiais">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {([
                                ['possui_substituicao_tributaria', 'Substituição Tributária', 'ST'],
                                ['possui_difal',                   'Diferencial de Alíquota', 'DIFAL'],
                                ['possui_inss_obra',               'INSS sobre Obra', 'INSS Obra'],
                                ['cprb',                           'Contrib. Prev. sobre Rec. Bruta', 'CPRB'],
                            ] as [keyof FormData, string, string][]).map(([field, title, badge]) => (
                                <label key={field}
                                    className={`flex flex-col gap-1 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                        form[field]
                                            ? 'border-orange-400 bg-orange-50 text-orange-700'
                                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                    }`}>
                                    <input type="checkbox" className="hidden"
                                        checked={form[field] as boolean}
                                        onChange={e => set(field, e.target.checked)} />
                                    <span className="text-[10px] font-black uppercase tracking-wide">{badge}</span>
                                    <span className="text-xs text-current opacity-70">{title}</span>
                                </label>
                            ))}
                        </div>
                    </Section>

                    <Section title="Certificado Digital (e-CNPJ / NF-e)">
                        <div className="space-y-3">
                            <CertificateExpiryWarning validade={form.certificado_validade} />

                            <div className="flex items-end gap-3 flex-wrap">
                                <div className="flex-1 min-w-48">
                                    <Field label="Validade do Certificado">
                                        <input type="date" className={inputCls}
                                            value={form.certificado_validade}
                                            onChange={e => set('certificado_validade', e.target.value)} />
                                    </Field>
                                </div>

                                <div className="flex gap-2">
                                    <input ref={certInputRef} type="file"
                                        accept=".pfx,.p12,.cer,.crt"
                                        className="hidden"
                                        onChange={handleCertUpload} />
                                    <button type="button"
                                        disabled={uploadingCert}
                                        onClick={() => certInputRef.current?.click()}
                                        className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl font-black text-xs uppercase tracking-wide hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-60">
                                        {uploadingCert
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <Upload className="w-4 h-4" />}
                                        {certUrl ? 'Substituir cert.' : 'Enviar cert.'}
                                    </button>
                                    {certUrl && (
                                        <button type="button" onClick={handleCertDownload}
                                            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-black text-xs uppercase tracking-wide hover:bg-gray-50 transition-all">
                                            <Download className="w-4 h-4" />
                                            Baixar
                                        </button>
                                    )}
                                </div>
                            </div>

                            {certUrl && (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <FileKey className="w-3.5 h-3.5" />
                                    Arquivo: {certUrl.split('/').pop()}
                                </div>
                            )}
                        </div>
                    </Section>

                    <Section title="Integrações Fiscais">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Prefeitura Integrada">
                                <input className={inputCls} placeholder="ex: São Paulo (Nota Paulistana)"
                                    value={form.prefeitura_integrada}
                                    onChange={e => set('prefeitura_integrada', e.target.value)} />
                            </Field>
                            <Field label="SEFAZ">
                                <div className="flex items-center gap-3 h-10">
                                    <label className={checkboxRowCls}>
                                        <input type="checkbox" checked={form.sefaz_integrada}
                                            onChange={e => set('sefaz_integrada', e.target.checked)} />
                                        Integração SEFAZ habilitada (NF-e / NFS-e)
                                    </label>
                                </div>
                            </Field>
                        </div>
                    </Section>

                    <SaveButton />
                </form>
            )}

            {/* ── Tab: Responsáveis ─────────────────────────────────── */}
            {tab === 'responsaveis' && (
                <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm space-y-6">
                    <Section title="Responsáveis da Empresa">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Responsável Legal">
                                <input className={inputCls} placeholder="Nome completo"
                                    value={form.responsavel_legal_nome}
                                    onChange={e => set('responsavel_legal_nome', e.target.value)} />
                            </Field>
                            <Field label="Responsável Financeiro">
                                <input className={inputCls} placeholder="Nome completo"
                                    value={form.responsavel_financeiro_nome}
                                    onChange={e => set('responsavel_financeiro_nome', e.target.value)} />
                            </Field>
                            <Field label="Responsável Operacional">
                                <input className={inputCls} placeholder="Nome completo"
                                    value={form.responsavel_operacional_nome}
                                    onChange={e => set('responsavel_operacional_nome', e.target.value)} />
                            </Field>
                            <Field label="Responsável Técnico (CREA/CAU)">
                                <input className={inputCls} placeholder="Nome e número de registro"
                                    value={form.responsavel_tecnico_crea}
                                    onChange={e => set('responsavel_tecnico_crea', e.target.value)} />
                            </Field>
                        </div>
                    </Section>
                    <SaveButton />
                </form>
            )}
        </div>
    );
};

export default CompanyDetailPage;
