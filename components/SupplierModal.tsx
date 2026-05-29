import React from 'react';
import { X, Truck, Mail, Phone, FileText, MapPin, Tag, Building2, User } from 'lucide-react';
import { Supplier, Organization } from '../types';
import { supplierCategoryService } from '../services/supplierCategoryService';
import { organizationService } from '../services/organizationService';
import { useStore } from '../store/useStore';
import SupplierBankAccountsTab from './SupplierBankAccountsTab';

interface SupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (supplier: Omit<Supplier, 'id' | 'created_at'>) => void;
    initialData?: Supplier;
}

const DEFAULT_CATEGORIES = [
    'Materiais de Construção',
    'Mão de Obra / Serviços',
    'Equipamentos / Ferramentas',
    'Consultoria / Projetos',
    'Transporte / Logística',
    'Outros'
];

const ESTADOS_BR = [
    { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' },
    { sigla: 'AP', nome: 'Amapá' }, { sigla: 'AM', nome: 'Amazonas' },
    { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
    { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' },
    { sigla: 'GO', nome: 'Goiás' }, { sigla: 'MA', nome: 'Maranhão' },
    { sigla: 'MT', nome: 'Mato Grosso' }, { sigla: 'MS', nome: 'Mato Grosso do Sul' },
    { sigla: 'MG', nome: 'Minas Gerais' }, { sigla: 'PA', nome: 'Pará' },
    { sigla: 'PB', nome: 'Paraíba' }, { sigla: 'PR', nome: 'Paraná' },
    { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' },
    { sigla: 'RJ', nome: 'Rio de Janeiro' }, { sigla: 'RN', nome: 'Rio Grande do Norte' },
    { sigla: 'RS', nome: 'Rio Grande do Sul' }, { sigla: 'RO', nome: 'Rondônia' },
    { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
    { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' },
    { sigla: 'TO', nome: 'Tocantins' },
];

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
    const set = (patch: Partial<typeof formData>) => setFormData(f => ({ ...f, ...patch }));

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

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onSubmit({
                ...formData,
                address: [formData.street, formData.number, formData.neighborhood].filter(Boolean).join(', ')
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const docLabel = formData.type === 'PJ' ? 'CNPJ' : 'CPF';
    const docPlaceholder = formData.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-end p-4">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Painel lateral direito com afastamento e bordas arredondas */}
            <div className="relative w-[480px] h-full bg-white rounded-[1.75rem] shadow-2xl flex flex-col overflow-hidden border border-gray-100 animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 bg-gray-50/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                            <Truck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-gray-900 leading-none">
                                {initialData ? 'Editar Registro' : 'Novo Fornecedor'}
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Gestão de Parceiros</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-all">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* Tabs de navegação — apenas ao editar fornecedor existente */}
                {initialData && (
                    <div className="flex border-b border-gray-100 px-7 shrink-0 bg-white">
                        {(['cadastro', 'bancario'] as const).map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setModalTab(tab)}
                                className={`px-4 py-3 text-[11px] font-black uppercase tracking-wider border-b-2 transition-all -mb-px ${
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
                            <label className={labelCls}>E-mail</label>
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

                    {/* Divisor endereço */}
                    <div className="flex items-center gap-2 pt-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-300" />
                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Endereço</span>
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

                    {/* Cidade + UF */}
                    <div className="grid grid-cols-5 gap-3">
                        <div className="col-span-3">
                            <label className={labelCls}>Cidade</label>
                            <input
                                type="text"
                                placeholder="São Paulo"
                                className={inputCls}
                                value={formData.city}
                                onChange={e => set({ city: e.target.value })}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className={labelCls}>Estado (UF)</label>
                            <select
                                className={inputCls + ' cursor-pointer'}
                                value={formData.state}
                                onChange={e => set({ state: e.target.value })}
                            >
                                <option value="">UF</option>
                                {ESTADOS_BR.map(e => (
                                    <option key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>
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
            </div>
        </div>
    );
};
