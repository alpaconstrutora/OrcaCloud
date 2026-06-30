import React from 'react';
import { Truck, Mail, Phone, FileText, MapPin, Tag, Building2, User, Briefcase } from 'lucide-react';
import { Supplier, Organization } from '../types';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { organizationService } from '../services/organizationService';
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

    const emptyForm = (): Omit<Supplier, 'id' | 'created_at'> => ({
        name: '', contact_name: '', email: '', phone: '', document: '',
        type: 'PJ', category: DEFAULT_CATEGORIES[0],
        street: '', number: '', neighborhood: '', address: '', city: '', state: '',
        organization_id: activeOrganizationId || null
    });

    const [formData, setFormData] = React.useState(emptyForm());
    const [dirty, setDirty] = React.useState(false);
    const set = (patch: Partial<typeof formData>) => {
        setFormData(f => ({ ...f, ...patch }));
        setDirty(true);
    };

    const handleDocumentChange = (value: string) => {
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
        if (initialData) {
            setFormData({
                name: initialData.name,
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
                organization_id: initialData.organization_id || null
            });
        } else {
            setFormData(emptyForm());
        }
    }, [initialData, isOpen, activeOrganizationId]);

    const isBroker = isRealEstateBrokerCategory(formData.category);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        // Corretor Imobiliário: e-mail + organização são obrigatórios para conectar ao Portal do Corretor
        if (isBroker) {
            if (!(formData.email || '').trim()) {
                alert('Para conectar ao Portal do Corretor, informe o e-mail do corretor (será o login dele no portal).');
                return;
            }
            if (!formData.organization_id) {
                alert('Para conectar ao Portal do Corretor, selecione uma organização específica (não "Todas").');
                return;
            }
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
                                onChange={e => set({ type: e.target.value as 'PF' | 'PJ', document: '' })}
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
                            <label className={labelCls}>Organização{isBroker ? ' *' : ''}</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <select
                                    className={inputWithIconCls + ' cursor-pointer'}
                                    value={formData.organization_id || ''}
                                    onChange={e => set({ organization_id: e.target.value || null })}
                                >
                                    <option value="" disabled={isBroker}>🌐 Todas</option>
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
                                Este fornecedor será conectado automaticamente ao <strong>Portal do Corretor</strong>.
                                Para isso, <strong>e-mail</strong> e <strong>organização</strong> são obrigatórios — o e-mail será o login do corretor no portal.
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
