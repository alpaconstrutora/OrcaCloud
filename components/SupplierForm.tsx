import React from 'react';
import { ArrowLeft, Truck, Tag, User, Mail, Phone, FileText, MapPin, Building2, Briefcase, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Supplier, Organization } from '../types';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { organizationService } from '../services/organizationService';
import { supplierService } from '../services/supplierService';
import { useOrgContext } from '../hooks/useOrgContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import SupplierBankAccountsTab from './SupplierBankAccountsTab';
import CityStateSelect from './CityStateSelect';
import SaveStatus from './ui/SaveStatus';
import { DEFAULT_SUPPLIER_CATEGORIES } from '../constants/supplierCategories';

/**
 * Cadastro de fornecedor — TELA, não drawer.
 *
 * Substituiu o `SupplierModal.tsx` (que era um `Sheet`) a pedido do usuário em
 * 07/09/2026: "Minha organização › Meus Fornecedores: da mesma maneira que foi
 * implementado em Meus Clientes, invés de abrir drawer ao clicar em editar,
 * abrir tela". Neste app "tela" tem significado técnico fixo — troca de
 * conteúdo IN-FLOW dentro do espaço da página, com sidebar e abas visíveis;
 * nunca `fixed inset-0`, nunca `Sheet`, nunca `Modal`. Referência direta:
 * `ClientForm.tsx` (mesmo cabeçalho, mesmas abas, mesmo rodapé §25).
 *
 * Quem troca lista ↔ formulário é o `SupplierList` (estado `formState`).
 *
 * Três abas, na mesma divisão do cadastro de cliente: "Dados gerais" (o que
 * identifica e qualifica o fornecedor, incluindo a consulta CNPJa), "Dados
 * bancários" (só na edição — depende de um `supplier_id` existente) e
 * "Endereços e contatos" (e-mail, telefone e o endereço inteiro). O cadastro é
 * um `<form>` só: a aba decide o que aparece, não o que é gravado.
 */

interface SupplierFormProps {
    /** Ausente = criação. */
    initialData?: Supplier;
    /** Grava o fornecedor. Devolve `true` quando a gravação deu certo. */
    onSubmit: (data: Omit<Supplier, 'id' | 'created_at'>) => Promise<boolean>;
    onClose: () => void;
}

const LABEL = 'block text-xs font-semibold text-slate-500 mb-1';
const INPUT = 'w-full h-9 rounded-[6px] border border-gray-200 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const INPUT_ICON = 'w-full h-9 rounded-[6px] border border-gray-200 pl-9 pr-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const SELECT = `${INPUT} bg-white`;

const DEFAULT_CATEGORIES = DEFAULT_SUPPLIER_CATEGORIES;

function maskCNPJ(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCPF(value: string): string {
    const d = value.replace(/\D/g, '').slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

// Abas do cadastro — §19.1 do guia (card branco, aba ativa `bg-white
// text-blue-600 shadow-sm` sobre trilho `bg-gray-50`). O `<h1>` continua sendo
// o nome do fornecedor; quem muda com a aba é o subtítulo, como em ClientForm.
type SupplierTabId = 'geral' | 'bancario' | 'contato';

const TAB_LABELS: Record<SupplierTabId, string> = {
    geral: 'Dados gerais',
    bancario: 'Dados bancários',
    contato: 'Endereços e contatos',
};

const TAB_SUBTITLES: Record<SupplierTabId, string> = {
    geral: 'Identificação, organização, portais e dados oficiais do CNPJ.',
    bancario: 'Contas bancárias e chaves PIX usadas para pagar este fornecedor.',
    contato: 'E-mail, telefone e endereço completo do fornecedor.',
};

const SupplierForm: React.FC<SupplierFormProps> = ({ initialData, onSubmit, onClose }) => {
    // Organização do seletor do topo, já com a herança de empresa/obra.
    const { orgId: activeOrganizationId } = useOrgContext();
    const [dynamicCategories, setDynamicCategories] = React.useState<string[]>(DEFAULT_CATEGORIES);
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [activeTab, setActiveTab] = React.useState<SupplierTabId>('geral');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [savedAt, setSavedAt] = React.useState<number | null>(null);
    const [isLookingUpCnpj, setIsLookingUpCnpj] = React.useState(false);
    const [cnpjaLookupStatus, setCnpjaLookupStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);
    // Erro de validação do próprio formulário. Substitui os `alert()` que o
    // SupplierModal usava: mensagem nativa não diz em qual campo está o
    // problema e some sem deixar rastro na tela.
    const [formError, setFormError] = React.useState<string | null>(null);
    const { dirty, markDirty, markSaved, confirmDiscard } = useUnsavedChanges();

    const emptyForm = (): Omit<Supplier, 'id' | 'created_at'> => ({
        name: '', nickname: '', contact_name: '', email: '', phone: '', document: '',
        type: 'PJ', category: DEFAULT_CATEGORIES[0], portal: 'Nenhum',
        street: '', number: '', neighborhood: '', address: '', city: '', state: '', zip_code: '',
        organization_id: activeOrganizationId || null,
        is_shared: false,
        cnpj_status: null, cnpj_status_date: null, cnpj_updated_at: null, cnpj_founded_at: null,
        cnpj_legal_nature: null, cnpj_company_size: null,
        cnpj_main_activity_code: null, cnpj_main_activity_text: null,
        cnpj_side_activities: null, cnpj_partners: null,
        cnpj_simples_optant: null, cnpj_simples_since: null,
        cnpj_simei_optant: null, cnpj_simei_since: null,
        cnpj_state_registrations: null,
    });

    const [formData, setFormData] = React.useState<Omit<Supplier, 'id' | 'created_at'>>(() => (
        initialData
            ? {
                code: initialData.code,
                name: initialData.name,
                nickname: initialData.nickname || '',
                contact_name: initialData.contact_name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                document: initialData.document || '',
                type: initialData.type,
                category: initialData.category || DEFAULT_CATEGORIES[0],
                portal: initialData.portal || 'Nenhum',
                street: initialData.street || initialData.address || '',
                number: initialData.number || '',
                neighborhood: initialData.neighborhood || '',
                address: initialData.address || '',
                city: initialData.city || '',
                state: initialData.state || '',
                zip_code: initialData.zip_code || '',
                organization_id: initialData.organization_id || null,
                is_shared: !!initialData.is_shared,
                cnpj_status: initialData.cnpj_status || null,
                cnpj_status_date: initialData.cnpj_status_date || null,
                cnpj_updated_at: initialData.cnpj_updated_at || null,
                cnpj_founded_at: initialData.cnpj_founded_at || null,
                cnpj_legal_nature: initialData.cnpj_legal_nature || null,
                cnpj_company_size: initialData.cnpj_company_size || null,
                cnpj_main_activity_code: initialData.cnpj_main_activity_code || null,
                cnpj_main_activity_text: initialData.cnpj_main_activity_text || null,
                cnpj_side_activities: initialData.cnpj_side_activities || null,
                cnpj_partners: initialData.cnpj_partners || null,
                cnpj_simples_optant: initialData.cnpj_simples_optant ?? null,
                cnpj_simples_since: initialData.cnpj_simples_since || null,
                cnpj_simei_optant: initialData.cnpj_simei_optant ?? null,
                cnpj_simei_since: initialData.cnpj_simei_since || null,
                cnpj_state_registrations: initialData.cnpj_state_registrations || null,
            }
            : emptyForm()
    ));

    const set = (patch: Partial<typeof formData>) => {
        setFormData(f => ({ ...f, ...patch }));
        setFormError(null);
        markDirty();
    };

    React.useEffect(() => {
        // As categorias dependem da organização ESCOLHIDA no formulário, não da
        // ativa no seletor global — com o topo em "Todas as organizações" a
        // lista nunca carregava e o campo Categoria ficava só com os defaults.
        supplierCategoryService.listCategories(formData.organization_id || undefined)
            .then(cats => setDynamicCategories(cats.length > 0 ? cats.map(c => c.name) : DEFAULT_CATEGORIES))
            .catch(() => setDynamicCategories(DEFAULT_CATEGORIES));
    }, [formData.organization_id]);

    React.useEffect(() => {
        organizationService.listOrganizations()
            .then(setOrganizations)
            .catch(() => setOrganizations([]));
    }, []);

    // Fonte única da verdade: o dropdown "Portais" decide, não a categoria.
    const isBroker = formData.portal === 'Portal do Corretor';

    const handleDocumentChange = (value: string) => {
        setCnpjaLookupStatus(null);
        set({ document: formData.type === 'PJ' ? maskCNPJ(value) : maskCPF(value) });
    };

    const handleLookupCnpj = async () => {
        const digits = (formData.document || '').replace(/\D/g, '');
        if (formData.type !== 'PJ') {
            setCnpjaLookupStatus({ type: 'error', message: 'A consulta CNPJa está disponível apenas para pessoa jurídica.' });
            return;
        }
        if (digits.length !== 14) {
            setCnpjaLookupStatus({ type: 'error', message: 'Informe um CNPJ válido com 14 dígitos.' });
            return;
        }

        setIsLookingUpCnpj(true);
        setCnpjaLookupStatus(null);
        try {
            const registration = await supplierService.lookupCnpjRegistration(digits);
            const patch: Partial<typeof formData> = {
                type: 'PJ',
                document: maskCNPJ(registration.document),
            };

            if (registration.name) patch.name = registration.name;
            if (registration.email) patch.email = registration.email;
            if (registration.phone) patch.phone = registration.phone;
            if (registration.street) patch.street = registration.street;
            if (registration.number) patch.number = registration.number;
            if (registration.neighborhood) patch.neighborhood = registration.neighborhood;
            if (registration.address) patch.address = registration.address;
            if (registration.city) patch.city = registration.city;
            if (registration.state) patch.state = registration.state;
            if (registration.zip_code) patch.zip_code = registration.zip_code;

            patch.cnpj_status = registration.cnpjStatus || null;
            patch.cnpj_status_date = registration.cnpjStatusDate || null;
            patch.cnpj_updated_at = registration.cnpjUpdatedAt || null;
            patch.cnpj_founded_at = registration.cnpjFoundedAt || null;
            patch.cnpj_legal_nature = registration.cnpjLegalNature || null;
            patch.cnpj_company_size = registration.cnpjCompanySize || null;
            patch.cnpj_main_activity_code = registration.cnpjMainActivityCode || null;
            patch.cnpj_main_activity_text = registration.cnpjMainActivityText || null;
            patch.cnpj_side_activities = registration.cnpjSideActivities || null;
            patch.cnpj_partners = registration.cnpjPartners || null;
            patch.cnpj_simples_optant = registration.cnpjSimplesOptant ?? null;
            patch.cnpj_simples_since = registration.cnpjSimplesSince || null;
            patch.cnpj_simei_optant = registration.cnpjSimeiOptant ?? null;
            patch.cnpj_simei_since = registration.cnpjSimeiSince || null;
            patch.cnpj_state_registrations = registration.cnpjStateRegistrations || null;

            setFormData(current => ({ ...current, ...patch }));
            markDirty();

            const updatedAt = registration.cnpjUpdatedAt
                ? new Date(registration.cnpjUpdatedAt).toLocaleDateString('pt-BR')
                : null;
            const statusBits = [
                registration.cnpjStatus ? `situação ${registration.cnpjStatus}` : null,
                updatedAt ? `base atualizada em ${updatedAt}` : null,
                registration.cnpjMainActivityText ? `CNAE: ${registration.cnpjMainActivityText}` : null,
            ].filter(Boolean).join(' | ');

            setCnpjaLookupStatus({
                type: 'success',
                message: statusBits ? `Cadastro atualizado pela CNPJa (${statusBits}).` : 'Cadastro atualizado pela CNPJa.',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erro ao consultar CNPJa.';
            setCnpjaLookupStatus({ type: 'error', message });
        } finally {
            setIsLookingUpCnpj(false);
        }
    };

    const handleBack = async () => {
        if (await confirmDiscard()) onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (!formData.name?.trim()) {
            // O nome vive na aba "Dados gerais": submeter de outra aba sem ele
            // não pode falhar em silêncio — traz o usuário ao campo faltante.
            setActiveTab('geral');
            setFormError('Informe a razão social / nome do fornecedor.');
            return;
        }
        // Todo fornecedor precisa de uma organização DONA — inclusive o
        // compartilhado, que é dono + `is_shared`. Barrar aqui, com mensagem,
        // em vez de deixar o banco recusar por NOT NULL (Fase 3 do plano de
        // 2026-08-28) com um erro que o usuário não sabe traduzir.
        if (!formData.organization_id) {
            setActiveTab('geral');
            setFormError('Escolha a organização dona deste fornecedor. Para deixá-lo disponível nas demais, marque "Disponível em todas as organizações".');
            return;
        }
        // Corretor Imobiliário: e-mail é obrigatório para conectar ao Portal do
        // Corretor. Compartilhado sincroniza em cada organização que o usuário
        // gerencia (supplierService.syncRealEstateBrokerProfile).
        if (isBroker && !(formData.email || '').trim()) {
            setActiveTab('contato');
            setFormError('Para conectar ao Portal do Corretor, informe o e-mail do corretor (será o login dele no portal).');
            return;
        }

        setFormError(null);
        setIsSubmitting(true);
        try {
            const ok = await onSubmit({
                ...formData,
                address: [formData.street, formData.number, formData.neighborhood].filter(Boolean).join(', '),
            });
            if (!ok) return;
            markSaved();
            setSavedAt(Date.now());
            // §25: criar fecha (a tarefa acabou); editar permanece na tela.
            if (!initialData) onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    // "Dados bancários" depende de um supplier_id existente — na criação a aba
    // não aparece, em vez de aparecer e não gravar nada.
    const tabs: SupplierTabId[] = initialData ? ['geral', 'bancario', 'contato'] : ['geral', 'contato'];

    const docLabel = formData.type === 'PJ' ? 'CNPJ' : 'CPF';
    const docPlaceholder = formData.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00';

    return (
        <div className="space-y-6">
            {/* Cabeçalho de tela in-flow — seta "voltar" + h1 text-2xl (§20; 3xl é
                só para o topo de uma lista-raiz). Mesmo padrão de ClientForm. */}
            <div className="flex items-center gap-4">
                <button
                    type="button"
                    onClick={handleBack}
                    className="p-2.5 bg-white border border-gray-200 rounded-[6px] text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm active:scale-95 group"
                    title="Voltar para a lista"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                </button>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-600">
                            {initialData ? (initialData.code || 'Fornecedor') : 'Novo cadastro'}
                        </span>
                        <span className="w-1 h-1 bg-gray-300 rounded-full" />
                        <span className="text-xs font-medium text-gray-400">Meus Fornecedores</span>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-tight">
                        {initialData ? (formData.name || initialData.name) : 'Novo fornecedor'}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1.5 font-medium">{TAB_SUBTITLES[activeTab]}</p>
                </div>
            </div>

            {/* Toolbar de abas — anatomia canônica §19.1. */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {tabs.map(tab => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                                activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            {TAB_LABELS[tab]}
                        </button>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {activeTab === 'bancario' && initialData ? (
                        // O componente da aba é `h-full`: sem uma altura no pai
                        // ele colapsa (memória "wrapper sem altura quebra h-full").
                        <div className="h-[55vh] min-h-[360px] flex flex-col">
                            <SupplierBankAccountsTab
                                supplierId={initialData.id}
                                organizationId={initialData.organization_id}
                            />
                        </div>
                    ) : (
                        <div className="p-6 space-y-6">
                            {activeTab === 'geral' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        {initialData && (
                                            <div>
                                                <label className={LABEL}>Código</label>
                                                <input
                                                    type="text"
                                                    className={INPUT}
                                                    placeholder="001"
                                                    value={formData.code ?? ''}
                                                    onChange={e => set({ code: e.target.value })}
                                                />
                                            </div>
                                        )}
                                        <div className={initialData ? 'md:col-span-3' : 'md:col-span-4'}>
                                            <label className={LABEL}>Razão social / nome</label>
                                            <div className="relative">
                                                <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    className={INPUT_ICON}
                                                    placeholder="Ex: Alpa Construtora Ltda"
                                                    value={formData.name ?? ''}
                                                    onChange={e => set({ name: e.target.value })}
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className={LABEL}>Apelido</label>
                                            <div className="relative">
                                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    className={INPUT_ICON}
                                                    placeholder="Nome curto para exibição em tabelas"
                                                    value={formData.nickname ?? ''}
                                                    onChange={e => set({ nickname: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={LABEL}>Nome do contato</label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    className={INPUT_ICON}
                                                    placeholder="Ex: João da Silva"
                                                    value={formData.contact_name ?? ''}
                                                    onChange={e => set({ contact_name: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className={LABEL}>Tipo de pessoa</label>
                                            <select
                                                className={SELECT}
                                                value={formData.type}
                                                onChange={e => {
                                                    setCnpjaLookupStatus(null);
                                                    set({ type: e.target.value as 'PF' | 'PJ', document: '' });
                                                }}
                                            >
                                                <option value="PJ">Pessoa Jurídica</option>
                                                <option value="PF">Pessoa Física</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={LABEL}>{docLabel}</label>
                                            <div className="relative">
                                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    className={INPUT_ICON}
                                                    placeholder={docPlaceholder}
                                                    value={formData.document ?? ''}
                                                    onChange={e => handleDocumentChange(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={LABEL}>Categoria</label>
                                            <select
                                                className={SELECT}
                                                value={formData.category ?? ''}
                                                onChange={e => set({ category: e.target.value })}
                                            >
                                                {dynamicCategories.map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {formData.type === 'PJ' && (
                                        <div className="space-y-3">
                                            <button
                                                type="button"
                                                onClick={handleLookupCnpj}
                                                disabled={isLookingUpCnpj}
                                                className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-600 border border-blue-200 rounded-[6px] hover:bg-blue-50 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Atualizar cadastro via CNPJa"
                                            >
                                                <RefreshCw className={`w-[15px] h-[15px] ${isLookingUpCnpj ? 'animate-spin' : ''}`} />
                                                {isLookingUpCnpj ? 'Consultando CNPJa...' : 'Consultar CNPJ na CNPJa'}
                                            </button>

                                            {cnpjaLookupStatus && (
                                                <div className={`flex items-start gap-2 rounded-[6px] border px-3 py-2.5 ${
                                                    cnpjaLookupStatus.type === 'success'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : 'border-rose-200 bg-rose-50 text-rose-700'
                                                }`}>
                                                    {cnpjaLookupStatus.type === 'success'
                                                        ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                                                        : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                                                    <p className="text-sm font-medium leading-snug">{cnpjaLookupStatus.message}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            {/* Organização = DONO do cadastro; compartilhar é uma marcação à
                                                parte. Antes a opção "Todas" gravava organização NULA, e a
                                                ausência de dono era o que dava a visibilidade global — o que
                                                também dava escrita a qualquer inquilino. Ver
                                                docs/planos/2026-08-28-organization-id-dono-explicito-e-compartilhamento.md
                                                e CLAUDE.md REGRA #5 ("'Todas' nunca é organization_id = NULL"). */}
                                            <label className={LABEL}>Organização</label>
                                            <div className="relative">
                                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <select
                                                    className={`${INPUT_ICON} bg-white`}
                                                    value={formData.organization_id || ''}
                                                    onChange={e => set({ organization_id: e.target.value || null })}
                                                >
                                                    <option value="">Selecione…</option>
                                                    {organizations.map(org => (
                                                        <option key={org.id} value={org.id}>{org.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <label className="flex items-start gap-2 mt-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    checked={!!formData.is_shared}
                                                    onChange={e => set({ is_shared: e.target.checked })}
                                                />
                                                <span className="text-xs font-medium text-gray-500 leading-snug">
                                                    Disponível em todas as organizações
                                                    <span className="block text-gray-400 font-normal">
                                                        Continua pertencendo à organização acima, que é quem pode editá-lo.
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                        <div>
                                            {/* Portais — fonte única que decide em qual portal externo o fornecedor aparece */}
                                            <label className={LABEL}>Portais</label>
                                            <div className="relative">
                                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <select
                                                    className={`${INPUT_ICON} bg-white`}
                                                    value={formData.portal ?? 'Nenhum'}
                                                    onChange={e => set({ portal: e.target.value as Supplier['portal'] })}
                                                >
                                                    <option value="Nenhum">Nenhum — não exibir em portais</option>
                                                    <option value="Portal do Corretor">Portal do Corretor</option>
                                                    <option value="Portal do Fornecedor">Portal do Fornecedor</option>
                                                    <option value="Portal do Parceiro">Portal do Parceiro</option>
                                                </select>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Define em qual portal externo este fornecedor aparece. "Nenhum" não o exibe em portal algum.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Aviso: conexão com o Portal do Corretor */}
                                    {isBroker && (
                                        <div className="flex items-start gap-2 rounded-[6px] border border-blue-200 bg-blue-50 px-3 py-2.5">
                                            <Briefcase className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                            <p className="text-sm font-medium text-blue-700 leading-snug">
                                                Este fornecedor será conectado automaticamente ao <strong>Portal do Corretor</strong> — o
                                                <strong> e-mail</strong> (aba "Endereços e contatos") é obrigatório e será o login do corretor no portal.
                                                {formData.is_shared
                                                    ? ' Como está marcado "Disponível em todas as organizações", ele fica na aba Corretores de cada organização que você gerencia — depois é só habilitá-lo por empreendimento.'
                                                    : ' Ele ficará disponível na aba Corretores desta organização.'}
                                            </p>
                                        </div>
                                    )}

                                    {(formData.cnpj_status || formData.cnpj_partners?.length || formData.cnpj_state_registrations?.length) && (
                                        <div className="space-y-4 pt-2 border-t border-gray-100">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                                Dados oficiais (CNPJa)
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {formData.cnpj_status && (
                                                    <div>
                                                        <span className={LABEL}>Situação cadastral</span>
                                                        <p className="text-sm font-medium text-gray-700">
                                                            {formData.cnpj_status}
                                                            {formData.cnpj_status_date ? ` desde ${new Date(formData.cnpj_status_date).toLocaleDateString('pt-BR')}` : ''}
                                                        </p>
                                                    </div>
                                                )}
                                                {formData.cnpj_founded_at && (
                                                    <div>
                                                        <span className={LABEL}>Data de fundação</span>
                                                        <p className="text-sm font-medium text-gray-700">{new Date(formData.cnpj_founded_at).toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                )}
                                                {formData.cnpj_legal_nature && (
                                                    <div>
                                                        <span className={LABEL}>Natureza jurídica</span>
                                                        <p className="text-sm font-medium text-gray-700">{formData.cnpj_legal_nature}</p>
                                                    </div>
                                                )}
                                                {formData.cnpj_company_size && (
                                                    <div>
                                                        <span className={LABEL}>Porte</span>
                                                        <p className="text-sm font-medium text-gray-700">{formData.cnpj_company_size}</p>
                                                    </div>
                                                )}
                                                {formData.cnpj_main_activity_text && (
                                                    <div className="md:col-span-2">
                                                        <span className={LABEL}>CNAE principal</span>
                                                        <p className="text-sm font-medium text-gray-700">
                                                            {formData.cnpj_main_activity_code ? `${formData.cnpj_main_activity_code} — ` : ''}
                                                            {formData.cnpj_main_activity_text}
                                                        </p>
                                                    </div>
                                                )}
                                                <div>
                                                    <span className={LABEL}>Simples Nacional</span>
                                                    <p className="text-sm font-medium text-gray-700">
                                                        {formData.cnpj_simples_optant
                                                            ? `Optante desde ${formData.cnpj_simples_since ? new Date(formData.cnpj_simples_since).toLocaleDateString('pt-BR') : '—'}`
                                                            : 'Não optante'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className={LABEL}>MEI</span>
                                                    <p className="text-sm font-medium text-gray-700">
                                                        {formData.cnpj_simei_optant
                                                            ? `Optante desde ${formData.cnpj_simei_since ? new Date(formData.cnpj_simei_since).toLocaleDateString('pt-BR') : '—'}`
                                                            : 'Não optante'}
                                                    </p>
                                                </div>
                                            </div>

                                            {!!formData.cnpj_side_activities?.length && (
                                                <div>
                                                    <span className={LABEL}>CNAEs secundários</span>
                                                    <ul className="text-sm font-normal text-gray-600 space-y-0.5">
                                                        {formData.cnpj_side_activities.map((a, i) => (
                                                            <li key={i}>{a.code ? `${a.code} — ` : ''}{a.text}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {!!formData.cnpj_partners?.length && (
                                                <div>
                                                    <span className={LABEL}>Sócios / QSA</span>
                                                    <ul className="text-sm font-normal text-gray-600 space-y-0.5">
                                                        {formData.cnpj_partners.map((p, i) => (
                                                            <li key={i}>{p.name}{p.role ? ` — ${p.role}` : ''}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {!!formData.cnpj_state_registrations?.length && (
                                                <div>
                                                    <span className={LABEL}>Inscrições estaduais</span>
                                                    <ul className="text-sm font-normal text-gray-600 space-y-0.5">
                                                        {formData.cnpj_state_registrations.map((r, i) => (
                                                            <li key={i}>
                                                                {r.number} ({r.state}) — {r.enabled ? 'Habilitada' : 'Não habilitada'}{r.status ? ` — ${r.status}` : ''}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'contato' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className={LABEL}>E-mail{isBroker ? ' (obrigatório para o Portal do Corretor)' : ''}</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="email"
                                                    className={INPUT_ICON}
                                                    placeholder="comercial@empresa.com"
                                                    value={formData.email ?? ''}
                                                    onChange={e => set({ email: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={LABEL}>WhatsApp / telefone</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    className={INPUT_ICON}
                                                    placeholder="(00) 0 0000-0000"
                                                    value={formData.phone ?? ''}
                                                    onChange={e => set({ phone: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={LABEL}>Rua / logradouro</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                className={INPUT_ICON}
                                                placeholder="Rua, Avenida, etc"
                                                value={formData.street ?? ''}
                                                onChange={e => set({ street: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-2">
                                            <label className={LABEL}>Bairro</label>
                                            <input
                                                type="text"
                                                className={INPUT}
                                                placeholder="Centro"
                                                value={formData.neighborhood ?? ''}
                                                onChange={e => set({ neighborhood: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className={LABEL}>Número</label>
                                            <input
                                                type="text"
                                                className={INPUT}
                                                placeholder="123 / S/N"
                                                value={formData.number ?? ''}
                                                onChange={e => set({ number: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <CityStateSelect
                                        cep={formData.zip_code}
                                        stateCode={formData.state}
                                        cityName={formData.city}
                                        onChange={({ cep, stateCode, cityName }) => set({
                                            zip_code: cep,
                                            state: stateCode ?? '',
                                            city: cityName ?? '',
                                        })}
                                        labelCls={LABEL}
                                        inputCls={`${INPUT} bg-white`}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Rodapé canônico da §25 — "Voltar" (não "Cancelar") em edição:
                        o que já foi salvo fica salvo. Fica fora do bloco de abas
                        para que salvar funcione de qualquer aba, inclusive a de
                        contas bancárias (que grava sozinha, conta a conta). */}
                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-end gap-3">
                        {formError && (
                            <p className="mr-auto flex items-center gap-2 text-sm font-medium text-rose-600">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {formError}
                            </p>
                        )}
                        {initialData && !formError && <SaveStatus dirty={dirty} savedAt={savedAt} className="mr-auto" />}
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex items-center justify-center h-9 px-3.5 bg-white text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-all active:scale-95"
                        >
                            {initialData ? 'Voltar' : 'Cancelar'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !formData.name?.trim() || (!!initialData && !dirty)}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Salvando...' : initialData ? 'Salvar alterações' : 'Salvar fornecedor'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default SupplierForm;
