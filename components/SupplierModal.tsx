import React from 'react';
import { Truck, Mail, Phone, FileText, MapPin, Tag, Building2, User, Briefcase, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Supplier, Organization } from '../types';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { organizationService } from '../services/organizationService';
import { supplierService } from '../services/supplierService';
import { useStore } from '../store/useStore';
import SupplierBankAccountsTab from './SupplierBankAccountsTab';
import CityStateSelect from './CityStateSelect';
import { DEFAULT_SUPPLIER_CATEGORIES, isRealEstateBrokerCategory } from '../constants/supplierCategories';
import { Sheet, SheetHeader } from './ui/sheet';

interface SupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (supplier: Omit<Supplier, 'id' | 'created_at'>) => void;
    initialData?: Supplier;
}

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

const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-900 placeholder-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-white';
const inputWithIconCls = 'pl-9 ' + inputCls;
const labelCls = 'block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1';

export const SupplierModal: React.FC<SupplierModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
    const { activeOrganizationId } = useStore();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [dynamicCategories, setDynamicCategories] = React.useState<string[]>(DEFAULT_CATEGORIES);
    const [organizations, setOrganizations] = React.useState<Organization[]>([]);
    const [modalTab, setModalTab] = React.useState<'cadastro' | 'bancario'>('cadastro');
    const [isLookingUpCnpj, setIsLookingUpCnpj] = React.useState(false);
    const [cnpjaLookupStatus, setCnpjaLookupStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const emptyForm = (): Omit<Supplier, 'id' | 'created_at'> => ({
        name: '', nickname: '', contact_name: '', email: '', phone: '', document: '',
        type: 'PJ', category: DEFAULT_CATEGORIES[0],
        street: '', number: '', neighborhood: '', address: '', city: '', state: '', zip_code: '',
        organization_id: activeOrganizationId || null,
        cnpj_status: null, cnpj_status_date: null, cnpj_updated_at: null, cnpj_founded_at: null,
        cnpj_legal_nature: null, cnpj_company_size: null,
        cnpj_main_activity_code: null, cnpj_main_activity_text: null,
        cnpj_side_activities: null, cnpj_partners: null,
        cnpj_simples_optant: null, cnpj_simples_since: null,
        cnpj_simei_optant: null, cnpj_simei_since: null,
        cnpj_state_registrations: null,
    });

    const [formData, setFormData] = React.useState(emptyForm());
    const [dirty, setDirty] = React.useState(false);
    const set = (patch: Partial<typeof formData>) => {
        setFormData(f => ({ ...f, ...patch }));
        setDirty(true);
    };

    const handleDocumentChange = (value: string) => {
        setCnpjaLookupStatus(null);
        set({ document: formData.type === 'PJ' ? maskCNPJ(value) : maskCPF(value) });
    };

    React.useEffect(() => {
        if (!isOpen) return;
        supplierCategoryService.listCategories(activeOrganizationId || undefined)
            .then(cats => setDynamicCategories(cats.length > 0 ? cats.map(c => c.name) : DEFAULT_CATEGORIES))
            .catch(() => setDynamicCategories(DEFAULT_CATEGORIES));
        organizationService.listOrganizations()
            .then(setOrganizations)
            .catch(() => setOrganizations([]));
    }, [isOpen, activeOrganizationId]);

    React.useEffect(() => {
        // Sempre volta para a aba de cadastro ao abrir/fechar
        setModalTab('cadastro');
        setDirty(false);
        setCnpjaLookupStatus(null);
        if (initialData) {
            setFormData({
                code: initialData.code,
                name: initialData.name,
                nickname: initialData.nickname || '',
                contact_name: initialData.contact_name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                document: initialData.document || '',
                type: initialData.type,
                category: initialData.category || DEFAULT_CATEGORIES[0],
                street: initialData.street || initialData.address || '',
                number: initialData.number || '',
                neighborhood: initialData.neighborhood || '',
                address: initialData.address || '',
                city: initialData.city || '',
                state: initialData.state || '',
                zip_code: initialData.zip_code || '',
                organization_id: initialData.organization_id || null,
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
            });
        } else {
            setFormData(emptyForm());
        }
    }, [initialData, isOpen, activeOrganizationId]);

    const isBroker = isRealEstateBrokerCategory(formData.category);
    const handleLookupCnpj = async () => {
        const digits = (formData.document || '').replace(/\D/g, '');
        if (formData.type !== 'PJ') {
            setCnpjaLookupStatus({ type: 'error', message: 'A consulta CNPJa esta disponivel apenas para pessoa juridica.' });
            return;
        }
        if (digits.length !== 14) {
            setCnpjaLookupStatus({ type: 'error', message: 'Informe um CNPJ valido com 14 digitos.' });
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
            setDirty(true);

            const updatedAt = registration.cnpjUpdatedAt
                ? new Date(registration.cnpjUpdatedAt).toLocaleDateString('pt-BR')
                : null;
            const statusBits = [
                registration.cnpjStatus ? `situacao ${registration.cnpjStatus}` : null,
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        // Corretor Imobiliário: e-mail é obrigatório para conectar ao Portal do Corretor.
        // Organização pode ser "Todas" — nesse caso sincroniza em cada organização
        // que o usuário gerencia (supplierService.syncRealEstateBrokerProfile).
        if (isBroker && !(formData.email || '').trim()) {
            alert('Para conectar ao Portal do Corretor, informe o e-mail do corretor (será o login dele no portal).');
            return;
        }
        setIsSubmitting(true);
        try {
            await onSubmit({
                ...formData,
                address: [formData.street, formData.number, formData.neighborhood].filter(Boolean).join(', ')
            });
            setDirty(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const docLabel = formData.type === 'PJ' ? 'CNPJ' : 'CPF';
    const docPlaceholder = formData.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00';

    return (
        <Sheet open={isOpen} onClose={onClose} size="lg" dirty={dirty}>
                {/* Header */}
                <SheetHeader onClose={onClose}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                            <Truck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-gray-900 leading-none">
                                {initialData ? 'Editar Registro' : 'Novo Fornecedor'}
                            </h2>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Gestão de Parceiros</p>
                        </div>
                    </div>
                </SheetHeader>

                {/* Tabs de navegação — apenas ao editar fornecedor existente */}
                {initialData && (
                    <div className="flex border-b border-gray-100 px-7 shrink-0 bg-white">
                        {(['cadastro', 'bancario'] as const).map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setModalTab(tab)}
                                className={`px-4 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all -mb-px ${
                                    modalTab === tab
                                        ? 'border-blue-500 text-blue-600'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                {tab === 'cadastro' ? '📋 Cadastro' : '🏦 Dados Bancários'}
                            </button>
                        ))}
                    </div>
                )}

                {/* Aba: Dados Bancários */}
                {initialData && modalTab === 'bancario' && (
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <SupplierBankAccountsTab
                            supplierId={initialData.id}
                            organizationId={initialData.organization_id}
                        />
                    </div>
                )}

                {/* Aba: Cadastro (formulário principal) */}
                {modalTab === 'cadastro' && (
                <form id="supplier-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-5 space-y-4">

                    {initialData && (
                        <div className="w-32">
                            <label className={labelCls}>Código</label>
                            <input
                                type="text"
                                placeholder="001"
                                className={inputCls}
                                value={formData.code ?? ''}
                                onChange={e => set({ code: e.target.value })}
                            />
                        </div>
                    )}

                    {/* Razão Social */}
                    <div>
                        <label className={labelCls}>Razão Social / Nome *</label>
                        <div className="relative">
                            <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                            <input
                                type="text" required
                                placeholder="Ex: Alpa Construtora Ltda"
                                className={inputWithIconCls}
                                value={formData.name}
                                onChange={e => set({ name: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Apelido */}
                    <div>
                        <label className={labelCls}>Apelido</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                            <input
                                type="text"
                                placeholder="Ex: Alpa (nome curto para exibição em tabelas)"
                                className={inputWithIconCls}
                                value={formData.nickname ?? ''}
                                onChange={e => set({ nickname: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Nome do Contato */}
                    <div>
                        <label className={labelCls}>Nome do Contato</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                            <input
                                type="text"
                                placeholder="Ex: João da Silva"
                                className={inputWithIconCls}
                                value={formData.contact_name}
                                onChange={e => set({ contact_name: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Tipo + Documento */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Tipo</label>
                            <select
                                className={inputCls + ' cursor-pointer'}
                                value={formData.type}
                                onChange={e => {
                                    setCnpjaLookupStatus(null);
                                    set({ type: e.target.value as 'PF' | 'PJ', document: '' });
                                }}
                            >
                                <option value="PJ">🏢 Pessoa Jurídica</option>
                                <option value="PF">👤 Pessoa Física</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>{docLabel}</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <input
                                    type="text"
                                    placeholder={docPlaceholder}
                                    className={inputWithIconCls + ' font-mono'}
                                    value={formData.document}
                                    onChange={e => handleDocumentChange(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {formData.type === 'PJ' && (
                        <button
                            type="button"
                            onClick={handleLookupCnpj}
                            disabled={isLookingUpCnpj}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black uppercase tracking-wider text-blue-700 transition-all hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Atualizar cadastro via CNPJa"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLookingUpCnpj ? 'animate-spin' : ''}`} />
                            {isLookingUpCnpj ? 'Consultando CNPJa...' : 'Consultar CNPJ na CNPJa'}
                        </button>
                    )}

                    {cnpjaLookupStatus && (
                        <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
                            cnpjaLookupStatus.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-rose-200 bg-rose-50 text-rose-700'
                        }`}>
                            {cnpjaLookupStatus.type === 'success'
                                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                                : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                            <p className="text-xs font-bold leading-snug">{cnpjaLookupStatus.message}</p>
                        </div>
                    )}

                    {/* E-mail + Telefone */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>E-mail{isBroker ? ' *' : ''}</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <input
                                    type="email"
                                    placeholder="comercial@empresa.com"
                                    className={inputWithIconCls}
                                    value={formData.email}
                                    onChange={e => set({ email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>WhatsApp / Telefone</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <input
                                    type="text"
                                    placeholder="(00) 0 0000-0000"
                                    className={inputWithIconCls}
                                    value={formData.phone}
                                    onChange={e => set({ phone: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Categoria + Organização */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Categoria</label>
                            <div className="relative">
                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <select
                                    className={inputWithIconCls + ' cursor-pointer'}
                                    value={formData.category}
                                    onChange={e => set({ category: e.target.value })}
                                >
                                    {dynamicCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Organização</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <select
                                    className={inputWithIconCls + ' cursor-pointer'}
                                    value={formData.organization_id || ''}
                                    onChange={e => set({ organization_id: e.target.value || null })}
                                >
                                    <option value="">🌐 Todas</option>
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Aviso: conexão com o Portal do Corretor */}
                    {isBroker && (
                        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
                            <Briefcase className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-xs font-medium text-blue-700 leading-snug">
                                Este fornecedor será conectado automaticamente ao <strong>Portal do Corretor</strong> — o
                                <strong> e-mail</strong> é obrigatório e será o login do corretor no portal.
                                {formData.organization_id
                                    ? ' Ele ficará disponível na aba Corretores desta organização.'
                                    : ' Com "Todas as organizações", ele fica disponível na aba Corretores de cada organização que você gerencia — depois é só habilitá-lo por empreendimento.'}
                            </p>
                        </div>
                    )}

                    {/* Divisor endereço */}
                    <div className="flex items-center gap-2 pt-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-xs font-black text-gray-300 uppercase tracking-widest">Endereço</span>
                        <div className="flex-1 h-px bg-gray-100" />
                    </div>

                    {/* Rua */}
                    <div>
                        <label className={labelCls}>Rua / Logradouro</label>
                        <input
                            type="text"
                            placeholder="Rua Exemplo"
                            className={inputCls}
                            value={formData.street}
                            onChange={e => set({ street: e.target.value })}
                        />
                    </div>

                    {/* Número + Bairro */}
                    <div className="grid grid-cols-5 gap-3">
                        <div className="col-span-2">
                            <label className={labelCls}>Número</label>
                            <input
                                type="text"
                                placeholder="123 / S/N"
                                className={inputCls}
                                value={formData.number}
                                onChange={e => set({ number: e.target.value })}
                            />
                        </div>
                        <div className="col-span-3">
                            <label className={labelCls}>Bairro</label>
                            <input
                                type="text"
                                placeholder="Centro"
                                className={inputCls}
                                value={formData.neighborhood}
                                onChange={e => set({ neighborhood: e.target.value })}
                            />
                        </div>
                    </div>

                    <CityStateSelect
                        stateCode={formData.state}
                        cityName={formData.city}
                        onChange={({ stateCode, cityName }) => set({
                            state: stateCode ?? '',
                            city: cityName ?? '',
                        })}
                        showCep={false}
                        labelCls={labelCls}
                        inputCls={inputCls}
                    />

                    {(formData.cnpj_status || formData.cnpj_partners?.length || formData.cnpj_state_registrations?.length) && (
                        <>
                            <div className="flex items-center gap-2 pt-1">
                                <FileText className="w-3.5 h-3.5 text-gray-300" />
                                <span className="text-xs font-black text-gray-300 uppercase tracking-widest">Dados Oficiais (CNPJa)</span>
                                <div className="flex-1 h-px bg-gray-100" />
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                {formData.cnpj_status && (
                                    <div>
                                        <span className={labelCls}>Situação Cadastral</span>
                                        <p className="font-bold text-gray-700">
                                            {formData.cnpj_status}
                                            {formData.cnpj_status_date ? ` desde ${new Date(formData.cnpj_status_date).toLocaleDateString('pt-BR')}` : ''}
                                        </p>
                                    </div>
                                )}
                                {formData.cnpj_founded_at && (
                                    <div>
                                        <span className={labelCls}>Data de Fundação</span>
                                        <p className="font-bold text-gray-700">{new Date(formData.cnpj_founded_at).toLocaleDateString('pt-BR')}</p>
                                    </div>
                                )}
                                {formData.cnpj_legal_nature && (
                                    <div>
                                        <span className={labelCls}>Natureza Jurídica</span>
                                        <p className="font-bold text-gray-700">{formData.cnpj_legal_nature}</p>
                                    </div>
                                )}
                                {formData.cnpj_company_size && (
                                    <div>
                                        <span className={labelCls}>Porte</span>
                                        <p className="font-bold text-gray-700">{formData.cnpj_company_size}</p>
                                    </div>
                                )}
                                {formData.cnpj_main_activity_text && (
                                    <div className="col-span-2">
                                        <span className={labelCls}>CNAE Principal</span>
                                        <p className="font-bold text-gray-700">
                                            {formData.cnpj_main_activity_code ? `${formData.cnpj_main_activity_code} — ` : ''}
                                            {formData.cnpj_main_activity_text}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <span className={labelCls}>Simples Nacional</span>
                                    <p className="font-bold text-gray-700">
                                        {formData.cnpj_simples_optant
                                            ? `Optante desde ${formData.cnpj_simples_since ? new Date(formData.cnpj_simples_since).toLocaleDateString('pt-BR') : '—'}`
                                            : 'Não optante'}
                                    </p>
                                </div>
                                <div>
                                    <span className={labelCls}>MEI</span>
                                    <p className="font-bold text-gray-700">
                                        {formData.cnpj_simei_optant
                                            ? `Optante desde ${formData.cnpj_simei_since ? new Date(formData.cnpj_simei_since).toLocaleDateString('pt-BR') : '—'}`
                                            : 'Não optante'}
                                    </p>
                                </div>
                            </div>

                            {!!formData.cnpj_side_activities?.length && (
                                <div>
                                    <span className={labelCls}>CNAEs Secundários</span>
                                    <ul className="text-xs text-gray-600 space-y-0.5">
                                        {formData.cnpj_side_activities.map((a, i) => (
                                            <li key={i}>{a.code ? `${a.code} — ` : ''}{a.text}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {!!formData.cnpj_partners?.length && (
                                <div>
                                    <span className={labelCls}>Sócios / QSA</span>
                                    <ul className="text-xs text-gray-600 space-y-0.5">
                                        {formData.cnpj_partners.map((p, i) => (
                                            <li key={i}>{p.name}{p.role ? ` — ${p.role}` : ''}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {!!formData.cnpj_state_registrations?.length && (
                                <div>
                                    <span className={labelCls}>Inscrições Estaduais</span>
                                    <ul className="text-xs text-gray-600 space-y-0.5">
                                        {formData.cnpj_state_registrations.map((r, i) => (
                                            <li key={i}>
                                                {r.number} ({r.state}) — {r.enabled ? 'Habilitada' : 'Não habilitada'}{r.status ? ` — ${r.status}` : ''}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </form>
                )}

                {/* Footer fixo — só aparece na aba de cadastro */}
                {modalTab === 'cadastro' && (
                <div className="shrink-0 flex gap-3 px-7 py-4 border-t border-gray-100 bg-gray-50/60">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-400 hover:text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                    >
                        Descartar
                    </button>
                    <button
                        type="submit"
                        form="supplier-form"
                        disabled={isSubmitting}
                        className="flex-[2] px-4 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-blue-600 transition-all shadow-lg font-black uppercase tracking-widest active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Salvando...' : (initialData ? 'Confirmar Ajustes' : 'Efetuar Cadastro')}
                    </button>
                </div>
                )}
        </Sheet>
    );
};
