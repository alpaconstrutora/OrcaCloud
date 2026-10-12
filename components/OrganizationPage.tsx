// components/OrganizationPage.tsx
//
// Aba "Organização" da ficha da organização (OrganizationDetail). O que é da
// ORGANIZAÇÃO — e só isso: logotipo, código, nome e o regime de reconhecimento
// de tributos (caixa/competência).
//
// CNPJ, contato e endereço (12/10/2026, plano docs/planos/2026-10-12-fundir-organizacao-e-grupo.md):
//   • org PJ — são da EMPRESA MATRIZ e se editam na aba Identificação. As colunas
//     da org são espelho mantido pelo banco (trg_matriz_espelha_na_org); editar
//     aqui não teria efeito (trg_org_campos_da_matriz repõe o valor da matriz).
//   • org PF — não tem matriz (`companies` não comporta CPF): os campos ficam
//     aqui, com CPF no lugar de CNPJ.
// A seção "Contas Bancárias" que morava aqui gravava em `payment_accounts` — a
// mesma lista de Minha Organização › Contas — e virou um atalho para lá.
import React, { useState, useRef, useEffect } from 'react';
import { Organization } from '../types';
import { taxPayableService } from '../services/taxPayableService';
import { organizationService } from '../services/organizationService';
import { Building2, Save, Upload, Trash2, MapPin, Landmark, Phone, ArrowRight, Loader2 } from 'lucide-react';
import SaveStatus from './ui/SaveStatus';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

interface OrganizationPageProps {
    organization: Organization;
    onUpdate: (org: Organization) => unknown;
    /** Org PJ: leva à aba Identificação da empresa matriz. */
    onIrParaIdentificacao?: () => void;
    /** Leva a Minha Organização › Contas (contas de pagamento). */
    onIrParaContas?: () => void;
    /** Avisa o pai para ele guardar a saída da ficha (§25). */
    onDirtyChange?: (dirty: boolean) => void;
}

// §30 — rótulo 6px acima do campo; campos h-9 na escala compacta (§16).
const inputCls = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-gray-400';
const labelCls = 'text-xs font-semibold text-slate-500';

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
    <div className={`space-y-1.5 ${className}`}>
        <label className={`block ${labelCls}`}>{label}</label>
        {children}
    </div>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        {icon}
        <h3 className="text-sm font-semibold text-gray-900">{children}</h3>
    </div>
);

const OrganizationPage: React.FC<OrganizationPageProps> = ({ organization, onUpdate, onIrParaIdentificacao, onIrParaContas, onDirtyChange }) => {
    const [formData, setFormData] = useState<Organization>(organization);
    const [logoPreview, setLogoPreview] = useState<string | null>(organization.logoUrl || null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { dirty, markDirty, markSaved } = useUnsavedChanges();
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    // Regime no momento em que a tela abriu (ou no último save) — base para detectar troca e reprocessar.
    const [initialRegime, setInitialRegime] = useState(organization.settings?.tax_recognition_regime ?? 'CAIXA');
    const pessoaFisica = organizationService.ehPessoaFisica(organization);

    // Outra organização na mesma ficha (troca pelo topo): recomeça do registro novo.
    // Só pelo id — o objeto muda de identidade a cada recarga da lista, e isso não
    // pode apagar o que o usuário está digitando.
    useEffect(() => {
        setFormData(organization);
        setLogoPreview(organization.logoUrl || null);
        setInitialRegime(organization.settings?.tax_recognition_regime ?? 'CAIXA');
        markSaved();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organization.id]);

    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.startsWith('address.')) {
            const addressField = name.split('.')[1];
            setFormData(prev => ({ ...prev, address: { ...prev.address, [addressField]: value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
        markDirty();
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setLogoPreview(base64String);
            setFormData(prev => ({ ...prev, logoUrl: base64String }));
            markDirty();
        };
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoPreview(null);
        setFormData(prev => ({ ...prev, logoUrl: undefined }));
        if (fileInputRef.current) fileInputRef.current.value = '';
        markDirty();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        try {
            // Troca de regime de reconhecimento re-data os tributos PENDENTES da org
            // automaticamente (idempotente; preserva os já pagos). Roda antes de salvar
            // e usa o regime novo explícito.
            const newRegime = formData.settings?.tax_recognition_regime ?? 'CAIXA';
            if (newRegime !== initialRegime) {
                try {
                    await taxPayableService.generateAllForOrganization(organization.id, newRegime);
                } catch (err) {
                    console.error('[OrganizationPage] Falha ao reprocessar tributos após troca de regime:', err);
                }
            }
            await onUpdate(formData);
            setInitialRegime(newRegime);
            markSaved();
            setSavedAt(Date.now());
        } finally {
            setSaving(false);
        }
    };

    const regimeMudou = (formData.settings?.tax_recognition_regime ?? 'CAIXA') !== initialRegime;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm space-y-8">
                {/* Identificação */}
                <div className="space-y-4">
                    <SectionTitle icon={<Building2 className="w-4 h-4 text-blue-600" />}>Identificação</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-x-6 gap-y-4">
                        {/* Logotipo — usado no cabeçalho dos PDFs, recibos e ofícios */}
                        <div className="space-y-1.5">
                            <span className={`block ${labelCls}`}>Logotipo</span>
                            <div className="w-full aspect-video bg-gray-50 rounded-[6px] border border-dashed border-gray-200 flex items-center justify-center overflow-hidden">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Logotipo" className="max-h-full max-w-full object-contain" />
                                ) : (
                                    <Building2 className="w-10 h-10 text-gray-300" />
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                            <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => fileInputRef.current?.click()}
                                    className="flex-1 flex items-center justify-center gap-1.5 h-8 px-3 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                    <Upload className="w-3.5 h-3.5" />
                                    {logoPreview ? 'Trocar' : 'Carregar'}
                                </button>
                                {logoPreview && (
                                    <button type="button" onClick={removeLogo} title="Remover logotipo"
                                        className="h-8 w-8 flex items-center justify-center border border-red-100 rounded-[6px] text-red-500 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400">PNG ou JPG até 2 MB; fundo transparente é o ideal.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 content-start">
                            <Field label="Código">
                                <input type="text" name="code" value={formData.code ?? ''} onChange={handleChange} className={inputCls} placeholder="001" />
                            </Field>
                            <Field label={pessoaFisica ? 'Nome completo' : 'Nome da organização'} className="sm:col-span-2">
                                <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputCls} />
                            </Field>
                            <Field label="Tipo de pessoa">
                                <p className="h-9 flex items-center text-sm text-gray-700">{pessoaFisica ? 'Pessoa física' : 'Pessoa jurídica'}</p>
                            </Field>
                            {pessoaFisica && (
                                <Field label="CPF" className="sm:col-span-2">
                                    <input type="text" name="cnpj" value={formData.cnpj || ''} onChange={handleChange} className={inputCls} placeholder="000.000.000-00" />
                                </Field>
                            )}
                            {!pessoaFisica && (
                                <div className="sm:col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                                    <span>CNPJ, contato e endereço são da empresa matriz{organization.cnpj ? ` (${organization.cnpj})` : ''}.</span>
                                    {onIrParaIdentificacao && (
                                        <button type="button" onClick={onIrParaIdentificacao}
                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                                            Editar na Identificação <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Pessoa física: contato e endereço moram na própria organização */}
                {pessoaFisica && (
                    <div className="space-y-4">
                        <SectionTitle icon={<Phone className="w-4 h-4 text-blue-600" />}>Contato</SectionTitle>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
                            <Field label="E-mail">
                                <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className={inputCls} />
                            </Field>
                            <Field label="Telefone / WhatsApp">
                                <input type="text" name="phone" value={formData.phone || ''} onChange={handleChange} className={inputCls} placeholder="(00) 00000-0000" />
                            </Field>
                            <Field label="Site">
                                <input type="text" name="website" value={formData.website || ''} onChange={handleChange} className={inputCls} />
                            </Field>
                        </div>
                    </div>
                )}
                {pessoaFisica && (
                    <div className="space-y-4">
                        <SectionTitle icon={<MapPin className="w-4 h-4 text-blue-600" />}>Endereço</SectionTitle>
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-x-6 gap-y-4">
                            <Field label="CEP" className="sm:col-span-2">
                                <input type="text" name="address.zipCode" value={formData.address?.zipCode || ''} onChange={handleChange} className={inputCls} placeholder="00000-000" />
                            </Field>
                            <Field label="Logradouro" className="col-span-2 sm:col-span-4">
                                <input type="text" name="address.street" value={formData.address?.street || ''} onChange={handleChange} className={inputCls} />
                            </Field>
                            <Field label="Número" className="sm:col-span-1">
                                <input type="text" name="address.number" value={formData.address?.number || ''} onChange={handleChange} className={inputCls} />
                            </Field>
                            <Field label="Bairro" className="sm:col-span-2">
                                <input type="text" name="address.neighborhood" value={formData.address?.neighborhood || ''} onChange={handleChange} className={inputCls} />
                            </Field>
                            <Field label="Cidade" className="sm:col-span-2">
                                <input type="text" name="address.city" value={formData.address?.city || ''} onChange={handleChange} className={inputCls} />
                            </Field>
                            <Field label="UF" className="sm:col-span-1">
                                <input type="text" name="address.state" value={formData.address?.state || ''} onChange={handleChange} className={inputCls} maxLength={2} />
                            </Field>
                        </div>
                    </div>
                )}

                {/* Tributação — regime de reconhecimento é da organização, não da empresa */}
                <div className="space-y-4">
                    <SectionTitle icon={<Landmark className="w-4 h-4 text-blue-600" />}>Tributação</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <Field label="Regime de reconhecimento de tributos">
                            <select
                                value={formData.settings?.tax_recognition_regime ?? 'CAIXA'}
                                onChange={(e) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        settings: { ...prev.settings, tax_recognition_regime: e.target.value as 'CAIXA' | 'COMPETENCIA' },
                                    }));
                                    markDirty();
                                }}
                                className={`${inputCls} cursor-pointer`}
                            >
                                <option value="CAIXA">Regime de Caixa (recebimento)</option>
                                <option value="COMPETENCIA">Regime de Competência (auferimento)</option>
                            </select>
                        </Field>
                        <p className="text-xs text-gray-500 sm:pt-6">
                            Data do fato gerador dos tributos comerciais (PIS/COFINS/CSLL/IRRF/INSS s/ Vendas de Ativos e Locações):
                            Caixa usa a data de recebimento da parcela; Competência, o mês de auferimento da receita.
                            Ao salvar uma troca de regime, os tributos pendentes são reprocessados.
                        </p>
                    </div>
                </div>

                {/* Contas de pagamento — o cadastro é a tela Contas */}
                <div className="space-y-4">
                    <SectionTitle icon={<Landmark className="w-4 h-4 text-blue-600" />}>Contas de pagamento</SectionTitle>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                        <span>As contas usadas em pagamentos e na conciliação são cadastradas em Minha Organização › Contas.</span>
                        {onIrParaContas && (
                            <button type="button" onClick={onIrParaContas}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium">
                                Abrir Contas <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Rodapé §25/§30 — linha solta abaixo do card; salvar não fecha a ficha */}
            <div className="flex items-center justify-end gap-4">
                <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />
                <button
                    type="submit"
                    disabled={saving || !dirty}
                    title={!dirty ? 'Nada a salvar: nenhuma alteração desde o último save.' : undefined}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                    {saving ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Save className="w-[15px] h-[15px]" />}
                    {saving && regimeMudou ? 'Reprocessando tributos…' : 'Salvar organização'}
                </button>
            </div>
        </form>
    );
};

export default OrganizationPage;
